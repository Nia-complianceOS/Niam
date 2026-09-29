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
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.api.deps import require_owner_id, require_writer
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
    user_id: str = Depends(require_writer),
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
    except scan_store.ScanAlreadyRunning:
        # The database's answer, which holds even when two requests pass
        # _enforce_rate_limit() at the same moment.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a scan running. Wait for it to finish before starting another.",
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


HEARTBEAT_SECONDS = 15


def _is_stale(row: dict) -> bool:
    """A scan whose owning process died never writes a terminal status."""
    updated = row.get("updated_at")
    if not updated:
        return False
    try:
        ts = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
    except ValueError:
        return False
    return datetime.now(timezone.utc) - ts > scan_store.STALE_AFTER


@router.get("/{scan_id}/events")
async def scan_events(scan_id: str, user_id: str = Depends(require_owner_id)):
    """Progress as server-sent events.

    Every connection replays the whole log from the start, so a client
    that reconnects loses nothing (the frontend de-duplicates). The
    Supabase client is synchronous, so each read runs in a worker thread
    instead of blocking the event loop for every other request. A comment
    line is sent every 15 seconds so proxies and the browser do not drop
    the connection during the long classification step.
    """
    try:
        scan = await asyncio.to_thread(scan_store.get, user_id, scan_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    async def event_stream():
        last_yielded = 0
        last_sent = asyncio.get_running_loop().time()
        while True:
            try:
                current = await asyncio.to_thread(scan_store.get, user_id, scan_id)
            except RuntimeError as exc:
                yield f"data: {json.dumps({'event': 'failed', 'error': str(exc)})}\n\n"
                return
            if current is None:
                return

            log = current["log"]
            while last_yielded < len(log):
                yield f"data: {json.dumps(log[last_yielded])}\n\n"
                last_yielded += 1
                last_sent = asyncio.get_running_loop().time()

            status_now = current.get("status")
            if status_now in ("completed", "failed"):
                # If the terminal entry never made it into the log (a
                # logging failure is swallowed so it cannot kill a scan),
                # synthesise one so the client is not left waiting.
                if not any(
                    isinstance(e, dict) and e.get("event") in ("completed", "failed")
                    for e in log
                ):
                    terminal = {"event": status_now}
                    if status_now == "failed":
                        terminal["error"] = current.get("error") or "Scan failed"
                    yield f"data: {json.dumps(terminal)}\n\n"
                return

            if _is_stale(current):
                yield "data: " + json.dumps(
                    {
                        "event": "failed",
                        "error": "The scan stopped reporting progress (the server may have restarted). Start it again.",
                    }
                ) + "\n\n"
                return

            now = asyncio.get_running_loop().time()
            if now - last_sent >= HEARTBEAT_SECONDS:
                yield ": ping\n\n"
                last_sent = now

            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
