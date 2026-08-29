"""
POST /api/v1/webhook/github

Receives GitHub push events. On a push to main, hands off to the
Data & Graph Intelligence module's reconciliation entrypoint — that
function doesn't exist yet (it's their code, under app/intelligence/),
so trigger_reconciliation() below is a stub that just logs for now.

Signature verification uses core/security.py's verify_github_signature()
against GITHUB_WEBHOOK_SECRET. Left permissive (warns but doesn't
reject) until a real secret is configured, so local testing without
a configured secret doesn't 403 every request.
"""

import logging

from uuid import uuid4
from fastapi import APIRouter, Header, Request, HTTPException, BackgroundTasks

from app.core.config import get_settings
from app.core.security import verify_github_signature
from app.services import scan_service

logger = logging.getLogger("continuum.webhook")

router = APIRouter()


@router.post("/github")
async def github_webhook(
    request: Request,
    background: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None),
):
    settings = get_settings()

    if (
        not settings.github_webhook_secret
        and settings.app_env != "development"
    ):
        raise HTTPException(
            status_code=403, detail="Webhook secret not configured"
        )

    body = await request.body()

    if settings.github_webhook_secret:
        if not verify_github_signature(body, x_hub_signature_256):
            raise HTTPException(
                status_code=403, detail="Invalid webhook signature"
            )
    else:
        # Permissive mode: processing the webhook without validating a signature.
        # This is safe because we already verified above that app_env == "development"
        # when github_webhook_secret is unset, so this is strictly a local dev-only path.
        pass

    payload = await request.json()
    if payload.get("ref") == "refs/heads/main":
        commit_sha = payload.get("after", "unknown")
        repo_full_name = payload.get("repository", {}).get(
            "full_name", "unknown"
        )

        scan_id = uuid4().hex
        scan_service.SCANS[scan_id] = {"status": "queued", "log": []}
        background.add_task(
            scan_service.run_scan, scan_id, repo_full_name, "main"
        )
        logger.info(
            f"Webhook triggered scan {scan_id} for {repo_full_name} @ {commit_sha}"
        )

    return {"status": "received"}
