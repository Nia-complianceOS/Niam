"""
POST /api/v1/webhook/github

Receives GitHub push events. A push to main queues a real background
scan through app/services/scan_service.py: GitHubScanner -> GraphWriter
-> Reconciler, the same pipeline POST /api/v1/scan runs.

(The previous version of this docstring described trigger_reconciliation()
as "a stub that just logs for now" living under app/intelligence/ -- a
directory that has never existed in this tree.)

WHOSE SCAN IS IT? A push webhook carries no authenticated user: GitHub is
calling, not a person with a JWT. Until tenancy landed this route passed
user_id=None straight through, which is now dead code twice over --
scan_store.create() and run_scan() both take owner_id first and refuse an
empty one, and GraphWriter and Reconciler raise without an owner. An
ownerless scan writes nodes no account can read anyway, so there was
never a "just run it unattached" option to fall back on.

So the repo is resolved to owners by asking the graph who has scanned it
before:

    MATCH (s:Scan {repo: $repo}) RETURN DISTINCT s.user_id

Prior art, not a guess: an account that has deliberately scanned this
repository through the authenticated API has demonstrated it wants
findings for it. One scan is queued per owner found, so two accounts
watching the same repository each get their own results in their own
subgraph -- and an account that has never touched this repo gets nothing,
which is the property that stops a push webhook being a way to write into
a stranger's graph.

Nobody found is a 200 with no scan. GitHub retries on a non-2xx, so
returning 5xx for "nobody here owns that repo" buys a redelivery queue
for a condition that will never resolve on its own.

Signature verification is unchanged: core/security.py's
verify_github_signature() against GITHUB_WEBHOOK_SECRET. Left permissive
(warns but doesn't reject) only when no secret is configured AND
APP_ENV=development, so local testing doesn't 403 every request.
"""

import json
import logging

from uuid import uuid4
from fastapi import APIRouter, Header, Request, HTTPException, BackgroundTasks

from app.core.config import get_settings
from app.core.security import verify_github_signature
from app.db.supabase import get_supabase
from app.services import scan_service, scan_store

logger = logging.getLogger("niam.webhook")

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

    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
        
    if payload.get("ref") != "refs/heads/main":
        return {"status": "received"}

    commit_sha = payload.get("after", "unknown")
    repo_full_name = payload.get("repository", {}).get("full_name", "unknown")

    try:
        supabase = get_supabase()
        response = supabase.table("scans").select("user_id").eq("repo", repo_full_name).execute()
        rows = response.data or []
    except Exception as exc:
        # 200 anyway. GitHub would redeliver on a 5xx, and a queue of
        # retries against an unreachable database helps nobody.
        logger.error(
            "Could not resolve owners for %s: %s", repo_full_name, exc
        )
        return {"status": "received", "scans": 0}

    owners = list(set([row["user_id"] for row in rows if row.get("user_id")]))
    if not owners:
        # Not an error, and deliberately not a scan. Nobody on this
        # instance has ever asked for findings on this repository, so
        # there is no account to write them into.
        logger.info(
            "Webhook for %s @ %s: no account has scanned this repository, "
            "nothing queued",
            repo_full_name,
            commit_sha,
        )
        return {"status": "received", "scans": 0}

    queued = 0
    for owner_id in owners:
        # No rate limit here: a push webhook is not a user pressing a
        # button, and GitHub retries on a non-2xx. The signature check
        # above is what stops this route being an open scan trigger.
        scan_id = uuid4().hex
        try:
            scan_store.create(
                owner_id,
                scan_id,
                repo=repo_full_name,
                ref="main",
                system_name=None,
                trigger="webhook",
            )
        except (RuntimeError, ValueError) as exc:
            # One owner's scan failing to register must not cost the
            # others theirs.
            logger.error(
                "Could not register webhook scan for owner %s on %s: %s",
                owner_id,
                repo_full_name,
                exc,
            )
            continue

        background.add_task(
            scan_service.run_scan, owner_id, scan_id, repo_full_name, "main"
        )
        queued += 1
        logger.info(
            "Webhook triggered scan %s for %s @ %s (owner %s)",
            scan_id,
            repo_full_name,
            commit_sha,
            owner_id,
        )

    return {"status": "received", "scans": queued}
