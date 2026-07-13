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

from fastapi import APIRouter, Header, Request

from app.core.config import get_settings
from app.core.security import verify_github_signature

logger = logging.getLogger("continuum.webhook")

router = APIRouter()


def trigger_reconciliation(commit_sha: str, repo_full_name: str) -> None:
    """
    STUB — hands off to the Data & Graph Intelligence module's
    reconciliation pipeline once it exists. For now just logs so we
    can confirm the webhook → trigger wiring works end-to-end.
    """
    logger.info("Reconciliation triggered for %s @ %s (stub — no-op)", repo_full_name, commit_sha)


@router.post("/github")
async def github_webhook(request: Request, x_hub_signature_256: str | None = Header(default=None)):
    body = await request.body()
    settings = get_settings()

    if settings.github_webhook_secret:
        if not verify_github_signature(body, x_hub_signature_256):
            return {"status": "rejected", "reason": "invalid signature"}

    payload = await request.json()
    if payload.get("ref") == "refs/heads/main":
        commit_sha = payload.get("after", "unknown")
        repo_full_name = payload.get("repository", {}).get("full_name", "unknown")
        trigger_reconciliation(commit_sha, repo_full_name)

    return {"status": "received"}