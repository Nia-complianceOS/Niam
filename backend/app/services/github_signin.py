"""
The second half of the GitHub OAuth flow, shared by "connect GitHub" and
"sign in with GitHub".

WHY TWO STEPS. The callback is an unauthenticated top-level navigation
from github.com. It used to finish the job right there -- attach the
token to whichever account the `state` named -- which meant the state
alone decided the account. Anyone could start a connect flow, send the
URL to a victim who had already authorised the app, and receive the
victim's repo-scoped token on their own account.

Now the callback only does the GitHub side (exchange the code, read the
user) and parks the result under a one-time code for two minutes. The
SPA then POSTs that code together with the VERIFIER whose hash it sent
when it started the flow. Only the browser that started the flow has the
verifier, and for a connect flow the SPA's own JWT must also belong to
the user who started it. The completion code is stored hashed, and no
JWT or GitHub token ever appears in a URL.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.core import crypto
from app.db.supabase import get_supabase
from app.services import github_identity, user_service

logger = logging.getLogger("niam.github.signin")

COMPLETION_TTL = timedelta(minutes=2)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def valid_binding(binding: str | None) -> bool:
    """A SHA-256 hex digest, nothing else."""
    return bool(binding) and len(binding) == 64 and all(
        c in "0123456789abcdef" for c in binding
    )


class FlowError(Exception):
    """Carries a reason code the SPA translates (githubMessages.ts)."""

    def __init__(self, reason: str, status: int = 400):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def park_completion(
    state_row: dict,
    token: str,
    identity: dict,
    email: str | None,
    email_verified: bool,
    scopes: list[str],
) -> str:
    """Store what the callback learned; return the one-time code."""
    code = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    get_supabase().table("oauth_completions").insert(
        {
            "code_hash": sha256_hex(code),
            "purpose": state_row["purpose"],
            "browser_binding": state_row["browser_binding"],
            "user_id": state_row.get("user_id"),
            "github_user_id": identity["id"],
            "login": identity.get("login"),
            "avatar_url": identity.get("avatar_url"),
            "name": identity.get("name"),
            "email": email,
            "email_verified": email_verified,
            "token_encrypted": crypto.encrypt(token),
            "scopes": scopes,
            "expires_at": (now + COMPLETION_TTL).isoformat(),
        }
    ).execute()
    return code


def _take_completion(code: str) -> dict | None:
    sb = get_supabase()
    code_hash = sha256_hex(code)
    try:
        resp = sb.rpc("consume_oauth_completion", {"p_code_hash": code_hash}).execute()
        data = getattr(resp, "data", None)
        if isinstance(data, list):
            return data[0] if data else None
    except Exception:
        pass
    resp = sb.table("oauth_completions").delete().eq("code_hash", code_hash).execute()
    rows = getattr(resp, "data", None) or []
    if not rows:
        return None
    row = rows[0]
    try:
        exp = datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    return row if exp > datetime.now(timezone.utc) else None


def redeem(code: str, verifier: str, expected_purpose: str) -> dict:
    """The parked completion, if and only if this browser started it."""
    if not code or not verifier:
        raise FlowError("missing_code")
    try:
        row = _take_completion(code)
    except Exception as exc:
        logger.error("Could not read OAuth completion: %s", exc)
        raise FlowError("storage_failed", 503)
    if row is None:
        raise FlowError("expired_code")
    if row.get("purpose") != expected_purpose:
        raise FlowError("invalid_state")
    if not secrets.compare_digest(sha256_hex(verifier), row.get("browser_binding") or ""):
        # Deliberately indistinguishable from an expired code to the user,
        # and logged, because it is what an attempted hijack looks like.
        logger.warning("OAuth completion presented with the wrong browser verifier")
        raise FlowError("browser_mismatch")
    token = crypto.decrypt(row.get("token_encrypted"))
    if not token:
        raise FlowError("storage_failed", 503)
    row["token"] = token
    return row


def finish_connect(row: dict, acting_user_id: str, workspace_id: str) -> dict:
    """Store the repository connection for the workspace, and link the
    GitHub identity to the person, so they can sign in with GitHub later.

    Linking happens here, and only here, for existing accounts: the user
    is signed in with their password and chose to connect. That is the
    explicit linking the design requires instead of matching by email.
    """
    if row.get("user_id") != acting_user_id:
        # Started by one Niam user, finished by another.
        raise FlowError("invalid_state")

    github_identity.save_connection(
        workspace_id,
        token=row["token"],
        login=row.get("login") or "",
        avatar_url=row.get("avatar_url"),
        scopes=row.get("scopes") or [],
        method=github_identity.METHOD_OAUTH,
    )

    linked = False
    try:
        existing = user_service.get_identity(
            user_service.PROVIDER_GITHUB, row["github_user_id"]
        )
        if existing is None or existing.get("user_id") == acting_user_id:
            user_service.link_identity(
                acting_user_id,
                user_service.PROVIDER_GITHUB,
                row["github_user_id"],
                row.get("login"),
                row.get("email"),
                bool(row.get("email_verified")),
            )
            linked = True
        else:
            logger.info(
                "GitHub account @%s is already the sign-in for another Niam "
                "account; connected for repositories without linking sign-in",
                row.get("login"),
            )
    except Exception as exc:
        # Before migration 005 there is no identity table. The repository
        # connection above still worked, which is what the user asked for.
        logger.warning("Could not link GitHub identity: %s", exc)
    return {"login": row.get("login"), "linked_for_signin": linked}


def finish_login(row: dict) -> tuple[user_service.User, bool]:
    """(user, created). Signs in a known GitHub identity, or creates a new
    account for an unknown one. Never links to an existing account by
    email -- see the module docstring and 005_github_signin.sql."""
    from app.services import membership_service

    gh_id = row["github_user_id"]
    identity = user_service.get_identity(user_service.PROVIDER_GITHUB, gh_id)

    if identity is not None:
        user = user_service.get_user_by_id(identity["user_id"])
        if user is None:
            raise FlowError("account_missing", 409)
        created = False
    else:
        email = row.get("email")
        verified = bool(row.get("email_verified"))
        if not email or not verified:
            raise FlowError("email_unverified", 409)
        if user_service.get_user_by_email(email) is not None:
            raise FlowError("account_exists_link_required", 409)
        user = user_service.create_user(
            email=email, hashed_password=None, name=row.get("name") or row.get("login")
        )
        membership_service.create_personal_workspace(user.id, user.name, user.email)
        user_service.link_identity(
            user.id,
            user_service.PROVIDER_GITHUB,
            gh_id,
            row.get("login"),
            email,
            verified,
        )
        created = True

    # "Never connect again": the sign-in token is also the repository
    # connection for the user's own workspace. Refreshed on every sign-in,
    # so a token revoked at GitHub is replaced by the next sign-in.
    github_identity.save_connection(
        user.id,
        token=row["token"],
        login=row.get("login") or "",
        avatar_url=row.get("avatar_url"),
        scopes=row.get("scopes") or [],
        method=github_identity.METHOD_OAUTH,
    )
    return user, created
