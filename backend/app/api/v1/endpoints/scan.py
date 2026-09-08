"""
Scan routes.

POST /scan is the most expensive thing this API can be asked to do: it
reads a whole repository through the GitHub API and sends every candidate
line to Gemini. On a laptop that only cost patience. On a public URL it
spends a shared quota, so it is rate-limited per user and capped
globally -- see _enforce_rate_limit().

GET /scan/{id}/events streams progress. Both routes require auth
(router.py mounts this router behind require_auth); the stream accepts
the token as a query parameter because EventSource cannot set headers.

The authenticated user is also the OWNER of everything the scan writes:
it is stored on the :Scan node, and passed to run_scan(), which hands it
to GraphWriter and Reconciler so the :System, :DataType, :Vendor and
:Gap nodes produced belong to this account and nobody else's dashboard
shows them.
"""

import asyncio
import json
import logging
import re
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.api.deps import require_auth
from app.core.config import get_settings
from app.services import scan_service, scan_store, workspace_service

logger = logging.getLogger("niam.scan")

router = APIRouter()

RATE_WINDOW = timedelta(hours=1)


class ScanRequest(BaseModel):
    repo_full_name: str
    ref: str = "main"
    # Which :System node this scan attaches to. Omit for the module
    # default. Set it to keep a throwaway/smoke scan separable from
    # demo data -- gap ids are scoped by it (see reconciler.py).
    system_name: str | None = None

    @field_validator("repo_full_name")
    @classmethod
    def validate_repo_full_name(cls, v: str) -> str:
        if not re.match(r"^[\w.\-]+/[\w.\-]+$", v):
            raise ValueError("Invalid repo_full_name format")
        return v

    @field_validator("ref")
    @classmethod
    def validate_ref(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9._/\-]+$", v):
            raise ValueError("Invalid ref format")
        return v

    @field_validator("system_name")
    @classmethod
    def validate_system_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not re.match(r"^[A-Za-z0-9._\-]{1,64}$", v):
            raise ValueError(
                "Invalid system_name (allowed: letters, digits, . _ -, max 64)"
            )
        return v


class ScanStartedResponse(BaseModel):
    scan_id: str


def _enforce_rate_limit(user_id: str) -> None:
    """
    Three limits, in the order a user meets them.

    One scan at a time per user, because a second scan of the same repo
    while the first is mid-write races the first one's graph writes for
    no benefit. An hourly ceiling, because that is the quota-shaped
    limit. A global concurrency cap, because Gemini's quota is shared
    across everyone using this deployment and one enthusiastic user
    should not exhaust it for the rest.

    Counted from :Scan nodes rather than process memory, so the limit
    holds across restarts and across instances. If the graph cannot be
    read the request is refused rather than waved through -- a scan
    cannot do anything useful with an unreachable graph anyway.
    """
    settings = get_settings()
    try:
        recent, running = scan_store.user_activity(user_id, RATE_WINDOW)
        globally_running = scan_store.global_running()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if running >= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You already have a scan running. Wait for it to finish "
                "before starting another."
            ),
        )

    if recent >= settings.scan_rate_limit_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Scan limit reached ({settings.scan_rate_limit_per_hour} per "
                "hour). Each scan reads a whole repository and calls the "
                "classifier on every candidate line."
            ),
            headers={"Retry-After": "3600"},
        )

    if globally_running >= settings.scan_max_concurrent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "The scanner is busy. Too many scans are running right now — "
                "try again in a few minutes."
            ),
            headers={"Retry-After": "120"},
        )


@router.post("", response_model=ScanStartedResponse, status_code=202)
def start_scan(
    body: ScanRequest,
    background: BackgroundTasks,
    user_id: str = Depends(require_auth),
):
    _enforce_rate_limit(user_id)

    # One :System per repository, per account. Left to the default, every
    # scan from the UI landed in the same :System -- so scanning a second
    # repository merged it into the first, and nothing afterwards could
    # say which codebase a vendor came from. That is wrong data, not
    # merely untidy: a finding attributed to the wrong repository sends a
    # reviewer to read the wrong file. An explicit system_name still wins,
    # which is what keeps the CLI's --system working.
    system_name = body.system_name or workspace_service.system_name_for_repo(
        body.repo_full_name
    )

    scan_id = uuid4().hex
    try:
        scan_store.create(
            user_id,
            scan_id,
            repo=body.repo_full_name,
            ref=body.ref,
            system_name=system_name,
        )
    except RuntimeError as exc:
        # Registering the scan is what makes it observable. Starting the
        # background task anyway would run the work with nowhere to report.
        raise HTTPException(status_code=503, detail=str(exc))

    background.add_task(
        scan_service.run_scan,
        user_id,
        scan_id,
        body.repo_full_name,
        body.ref,
        system_name,
    )
    return ScanStartedResponse(scan_id=scan_id)


@router.get("/{scan_id}/events")
async def scan_events(scan_id: str, user_id: str = Depends(require_auth)):
    # The ownership check is now inside scan_store.get()'s Cypher, so
    # another account's scan simply does not come back. The old check
    # here ran in Python AFTER the row -- repo name, ref and progress log
    # included -- had already been read out of the graph, and it was
    # conditional on `scan.get("user_id")` being truthy, so a scan stored
    # with no user (the webhook path) was streamed to any caller.
    try:
        scan = scan_store.get(user_id, scan_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def event_stream():
        last_yielded = 0
        # One second rather than half: every poll is a Cypher round trip
        # now, and the events being reported take seconds each anyway.
        while True:
            try:
                current = scan_store.get(user_id, scan_id)
            except RuntimeError as exc:
                yield f"data: {json.dumps({'event': 'failed', 'error': str(exc)})}\n\n"
                return
            if current is None:
                return

            log = current["log"]
            while last_yielded < len(log):
                yield f"data: {json.dumps(log[last_yielded])}\n\n"
                last_yielded += 1

            if current.get("status") in ("completed", "failed"):
                break

            await asyncio.sleep(1.0)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
