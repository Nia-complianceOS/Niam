"""
Request dependencies.

AUTHENTICATION IS REAL. Every route marked "Protected" in router.py
requires a valid JWT issued by POST /api/v1/auth/login, /auth/signup or
the GitHub sign-in exchange (/auth/github/exchange).

The old hardcoded "mock-token-123" bypass is gone for good; see git
history for why it existed and why it was deleted rather than re-guarded.

TWO IDENTITIES PER REQUEST. `require_auth` answers "which person is
this" (a user id). `current_workspace` answers "whose data are they
acting on" (a workspace id), which is what every graph and Postgres query
is scoped by -- it is the `owner_id` the services take first.

Every account has a workspace whose id IS that account's user id, so for
anyone acting in their own workspace the two are the same value and every
existing `owner_id` in Neo4j stays valid with no migration. They differ
only when someone invited into another workspace (a legal reviewer, say)
acts in it. Membership is checked on the server on every request: a
workspace id sent by the client is a request, not a credential.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer

from app.core import auth

security = HTTPBearer(auto_error=False)

WORKSPACE_HEADER = "X-Niam-Workspace"

ROLE_OWNER = "owner"
ROLE_LEGAL = "legal"
ROLE_MEMBER = "member"


def require_auth(request: Request, credentials=Depends(security)) -> str:
    """The authenticated user's id, from the Bearer token.

    A `?token=` query parameter is accepted ONLY on the scan progress
    stream, and only as a short-lived SSE ticket. EventSource cannot set
    headers, so that one route needs it; accepting it everywhere made a
    five-minute ticket -- which lands in access logs and browser history
    -- a full credential for /workspace/reset and /gaps/{id}/open-pr.
    """
    token = None
    is_query_param = False
    if credentials:
        token = credentials.credentials
    elif "token" in request.query_params and request.url.path.endswith("/events"):
        token = request.query_params["token"]
        is_query_param = True

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return auth.verify_token(token, expected_type="sse" if is_query_param else None)


@dataclass(frozen=True)
class Workspace:
    user_id: str
    workspace_id: str
    role: str

    @property
    def is_owner(self) -> bool:
        return self.role == ROLE_OWNER


# Membership is read on every request. A short cache keeps that from
# doubling the latency of every page; 20 seconds is also the longest a
# removed member can keep acting, which is acceptable for this product.
_CACHE_TTL = 20.0
_cache: dict[tuple[str, str], tuple[float, Workspace | None]] = {}


def clear_membership_cache() -> None:
    _cache.clear()


def _resolve(user_id: str, requested: str | None) -> Workspace:
    # Imported here: membership_service imports the Supabase client, and
    # keeping deps.py importable without it keeps the test surface small.
    from app.services import membership_service

    key = (user_id, requested or "")
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        ws = hit[1]
    else:
        ws = membership_service.resolve_workspace(user_id, requested)
        _cache[key] = (time.monotonic(), ws)

    if ws is None:
        # Same answer for "no such workspace" and "not a member": telling
        # a stranger which workspace ids exist helps nobody.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of that workspace",
        )
    return ws


def current_workspace(
    request: Request, user_id: str = Depends(require_auth)
) -> Workspace:
    requested = request.headers.get(WORKSPACE_HEADER) or request.query_params.get(
        "ws"
    )
    return _resolve(user_id, requested)


def require_owner_id(ws: Workspace = Depends(current_workspace)) -> str:
    """The tenant key every service takes first."""
    return ws.workspace_id


def require_role(*roles: str):
    """Dependency factory: the workspace context, or 403 for other roles."""

    def _dep(ws: Workspace = Depends(current_workspace)) -> Workspace:
        if ws.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your role in this workspace ("
                    + ws.role
                    + ") cannot do this. Needs: "
                    + " or ".join(roles)
                    + "."
                ),
            )
        return ws

    return _dep


def require_writer(ws: Workspace = Depends(current_workspace)) -> str:
    """Owners and members change the workspace's data (scans, removals);
    a legal reviewer reads everything and acts only on reviews."""
    if ws.role not in (ROLE_OWNER, ROLE_MEMBER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Legal reviewers can read findings but not change scans or repositories.",
        )
    return ws.workspace_id


def require_workspace_owner(ws: Workspace = Depends(current_workspace)) -> str:
    if not ws.is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a workspace owner can do this.",
        )
    return ws.workspace_id
