"""
Per-user GitHub credentials.

Until this existed, one GITHUB_TOKEN out of the environment served every
request. That is wrong in a multi-tenant app in three separate ways, and
only the first is obvious:

  1. GET /github/repos listed the repositories of whoever owned that PAT.
     Every user saw the same list -- private repository names belonging
     to a stranger -- and none of them saw their own.
  2. A pull request opened from a gap was authored by that PAT's account,
     so the audit trail on the customer's repository named the wrong
     human. "Who approved this change to the privacy policy" is the one
     question a compliance tool must never answer incorrectly.
  3. A scan could only ever reach repositories that one token could
     reach, which is why the scan panel asked people to type owner/repo
     from memory and then 404'd.

So each user connects their own account, by OAuth (primary) or by
pasting a personal access token (the offline-demo fallback), and every
GitHub call in the backend runs on the token of the user who asked.

THE TOKEN IS NEVER STORED, LOGGED OR RETURNED IN THE CLEAR. It is
encrypted with core/crypto.py before it reaches the database, get_token()
is the only function that decrypts it, and get_connection() -- the one
the API serves -- does not read the property at all. If encryption is
unavailable (TOKEN_ENCRYPTION_KEY unset outside development) saving
raises rather than falling back to plaintext.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from app.core import crypto
from app.db.supabase import get_supabase
from app.services import audit_service

logger = logging.getLogger("niam.github.identity")

# How long an OAuth `state` stays usable. This is the window between the
# SPA opening github.com and the browser coming back, so minutes, not
# hours: an unexpired state sitting in the database is a usable answer to
# "which account should this code be attached to".
STATE_TTL = timedelta(minutes=10)

METHOD_OAUTH = "oauth"
METHOD_TOKEN = "token"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def save_connection(
    owner_id: str,
    token: str,
    login: str,
    avatar_url: str | None,
    scopes: list[str] | None,
    method: str,
) -> None:
    """Store (or replace) this account's GitHub credential, encrypted.

    Raises RuntimeError if encryption is unavailable. The caller turns
    that into a 503 naming TOKEN_ENCRYPTION_KEY -- deliberately louder
    than storing the token in the clear and carrying on.
    """
    if not owner_id:
        raise ValueError(
            "save_connection requires owner_id: a GitHub token stored "
            "against no account is a credential nobody can revoke"
        )
    if not token:
        raise ValueError("save_connection requires a token")

    encrypted = crypto.encrypt(token)

    try:
        supabase = get_supabase()
        supabase.table("github_connections").upsert(
            {
                "user_id": owner_id,
                "token_encrypted": encrypted,
                "login": login or "",
                "avatar_url": avatar_url or "",
                "scopes": list(scopes or []),
                "method": method,
                "updated_at": _now().isoformat(),
            },
            on_conflict="user_id"
        ).execute()
        
        # login, not token. This line ends up in a log aggregator.
        logger.info(
            "Stored GitHub connection for owner %s as @%s (method=%s)",
            owner_id,
            login,
            method,
        )
        
        audit_service.log_event(
            owner_id,
            "github_connected",
            "GitHub connected",
            f"Connected GitHub account @{login}",
            actor="User",
            metadata={"login": login, "method": method},
        )
    except Exception as e:
        raise RuntimeError(f"Database error in save_connection: {e}")


def get_connection(owner_id: str) -> dict | None:
    """Public metadata about this account's connection, or None.

    Never includes the token, and never can: the query does not select
    it.
    """
    if not owner_id:
        return None

    try:
        supabase = get_supabase()
        response = (
            supabase.table("github_connections")
            .select("login, avatar_url, scopes, method, connected_at")
            .eq("user_id", owner_id)
            .maybe_single()
            .execute()
        )

        if not response or getattr(response, "data", None) is None or not response.data:
            return None

        row = response.data
        return {
            "login": row.get("login") or "",
            "avatar_url": row.get("avatar_url") or None,
            "scopes": [s for s in (row.get("scopes") or []) if s],
            "method": row.get("method") or METHOD_TOKEN,
            "connected_at": row.get("connected_at") or "",
        }
    except Exception as e:
        raise RuntimeError(f"Database error in get_connection: {e}")


def get_token(owner_id: str) -> str | None:
    """This account's decrypted GitHub token, or None if there is none.

    None covers "never connected" and "stored under a key we no longer
    hold" alike, because both mean the same thing to every caller: ask
    the user to connect. github_service turns it into a 409.
    """
    if not owner_id:
        return None

    try:
        supabase = get_supabase()
        response = (
            supabase.table("github_connections")
            .select("token_encrypted")
            .eq("user_id", owner_id)
            .maybe_single()
            .execute()
        )

        if not response or getattr(response, "data", None) is None or not response.data:
            return None

        return crypto.decrypt(response.data.get("token_encrypted"))
    except Exception as e:
        raise RuntimeError(f"Database error in get_token: {e}")


def delete_connection(owner_id: str) -> bool:
    """Forget this account's credential. True if there was one.

    Note this does not revoke the token at GitHub -- only the user can do
    that, from their account settings -- so the API response says so.
    """
    if not owner_id:
        return False
        
    try:
        supabase = get_supabase()
        response = (
            supabase.table("github_connections")
            .delete()
            .eq("user_id", owner_id)
            .execute()
        )
        # response.data contains the deleted rows if any
        success = bool(response and getattr(response, "data", None))
        if success:
            audit_service.log_event(
                owner_id,
                "github_disconnected",
                "GitHub disconnected",
                "Disconnected GitHub account",
                actor="User",
            )
        return success
    except Exception as e:
        raise RuntimeError(f"Database error in delete_connection: {e}")


def create_state(owner_id: str) -> str:
    """Mint a one-use, expiring OAuth state bound to this account."""
    if not owner_id:
        raise ValueError(
            "create_state requires owner_id: the state is what identifies "
            "the user when the callback arrives unauthenticated"
        )
    now = _now()
    
    try:
        supabase = get_supabase()
        
        # Housekeeping: Purge expired states
        try:
            supabase.table("oauth_states").delete().lt("expires_at", now.isoformat()).execute()
        except Exception as exc:
            # Housekeeping only. Failing it must not stop a user connecting.
            logger.warning("Could not purge expired OAuth states: %s", exc)

        state = secrets.token_urlsafe(32)
        supabase.table("oauth_states").insert(
            {
                "state": state,
                "user_id": owner_id,
                "created_at": now.isoformat(),
                "expires_at": (now + STATE_TTL).isoformat(),
            }
        ).execute()
        
        return state
    except Exception as e:
        raise RuntimeError(f"Database error in create_state: {e}")


def consume_state(state: str) -> str | None:
    """Redeem a state, returning the owner it was issued to, or None.

    None means unknown, already used, or expired -- all of which the
    callback must treat identically: refuse, and say nothing about which
    it was. The row is deleted as part of the same query, so two
    concurrent redemptions of one state cannot both succeed.
    """
    if not state:
        return None

    try:
        supabase = get_supabase()

        # Try atomic RPC first
        try:
            rpc_resp = supabase.rpc("consume_oauth_state", {"p_state": state}).execute()
            if rpc_resp and rpc_resp.data is not None:
                if isinstance(rpc_resp.data, str) and rpc_resp.data:
                    return rpc_resp.data
                if isinstance(rpc_resp.data, list) and rpc_resp.data:
                    first = rpc_resp.data[0]
                    return first.get("user_id") if isinstance(first, dict) else str(first)
        except Exception:
            # Fallback to atomic delete-first if RPC is not registered
            pass

        # Atomic DELETE-first: PostgREST returns the deleted row(s).
        # The DELETE serializes concurrent requests so only one caller gets the row back.
        del_resp = (
            supabase.table("oauth_states")
            .delete()
            .eq("state", state)
            .execute()
        )
        rows = del_resp.data if del_resp and hasattr(del_resp, "data") and del_resp.data else []
        if not rows:
            return None

        row = rows[0]
        expires_at = row.get("expires_at") or ""
        try:
            if datetime.fromisoformat(expires_at.replace('Z', '+00:00')) < _now():
                logger.info("Rejected an expired GitHub OAuth state")
                return None
        except (TypeError, ValueError):
            # An unparseable expiry is not a reason to trust the row.
            logger.warning("Rejected an OAuth state with an unreadable expiry")
            return None

        return row.get("user_id") or None
    except Exception as e:
        raise RuntimeError(f"Database error in consume_state: {e}")
