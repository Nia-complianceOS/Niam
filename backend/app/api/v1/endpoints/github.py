"""
GET    /api/v1/github/repos          — Repositories page (the user's own)
GET    /api/v1/github/prs            — Pull Requests page
GET    /api/v1/github/connection     — is this account connected, and as whom
POST   /api/v1/github/connect-token  — connect by pasting a PAT (fallback)
DELETE /api/v1/github/connection     — disconnect

Every route here takes the account from the JWT (Depends(require_auth))
and hands it to the service as the first argument, per
smoke/TENANCY_CONTRACT.md. That is not bookkeeping on these two reads: a
repository list is a list of private repository NAMES, and before GitHub
access was per-user this endpoint served the same stranger's list to
everybody.

The OAuth pair (/github/oauth/start and /github/oauth/callback) lives in
github_oauth.py rather than here, because the callback is the one GitHub
route that CANNOT require a JWT -- the browser arrives from github.com
with no Authorization header -- so it has to be mounted outside this
router's blanket auth dependency.

The write path (opening a PR) stays on POST /api/v1/gaps/{id}/open-pr in
gaps.py, since a PR is always created from a specific gap. The inbound
webhook receiver lives separately in webhook.py.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import require_auth
from app.schemas.prs import PRsResponse
from app.schemas.repos import ReposResponse
from app.services import github_identity, github_service

logger = logging.getLogger("niam.github")

router = APIRouter()


class ConnectionStatus(BaseModel):
    """What the UI needs to draw either an avatar or a Connect button.

    No token field, and there must never be one. The token is written
    encrypted, read only by github_service, and does not leave this
    process -- a response model with a passthrough field is exactly how
    that stops being true.
    """

    connected: bool
    login: str | None = None
    avatar_url: str | None = None
    scopes: list[str] = Field(default_factory=list)
    # "oauth" or "token" -- shown so a user who pasted a PAT for an
    # offline demo can see why their connection has no avatar.
    method: str | None = None
    connected_at: str | None = None


class ConnectTokenRequest(BaseModel):
    token: str


class DisconnectResponse(BaseModel):
    connected: bool = False
    # True if there was something to remove. False is not an error:
    # disconnecting an account that is not connected is the state the
    # caller asked for.
    removed: bool
    message: str


def _status(owner_id: str) -> ConnectionStatus:
    conn = github_identity.get_connection(owner_id)
    if not conn:
        return ConnectionStatus(connected=False)
    return ConnectionStatus(connected=True, **conn)


@router.get("/repos", response_model=ReposResponse)
def repos(
    q: str | None = Query(
        default=None,
        description="Case-insensitive substring filter on owner/repo.",
    ),
    user_id: str = Depends(require_auth),
):
    """This user's repositories. 409 if they have not connected GitHub.

    409 rather than an empty list on purpose: "you have no repositories"
    and "we cannot see your repositories" look identical in a picker and
    need different actions from the user. The frontend renders the 409 as
    a Connect button.
    """
    return github_service.list_repositories(user_id, query=q)


@router.get("/prs", response_model=PRsResponse)
def pull_requests(user_id: str = Depends(require_auth)):
    return github_service.list_pull_requests(user_id)


@router.get("/connection", response_model=ConnectionStatus)
def connection(user_id: str = Depends(require_auth)):
    try:
        return _status(user_id)
    except RuntimeError as exc:
        # The graph is down. Say so rather than reporting "not connected",
        # which would invite the user to reconnect an account that is
        # already fine.
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/connect-token", response_model=ConnectionStatus)
def connect_token(
    body: ConnectTokenRequest, user_id: str = Depends(require_auth)
):
    """Connect by pasting a personal access token.

    The fallback for an offline demo, or for an instance with no OAuth
    App registered: OAuth needs github.com reachable in a browser and a
    callback URL that resolves, and neither is guaranteed on a laptop on
    a conference network.

    The token is validated against GitHub before it is stored, so a typo
    fails here with "GitHub Bad credentials" instead of days later as an
    unexplained 401 in the middle of a scan. It is then encrypted and
    stored exactly the way an OAuth token is -- same node, same
    encryption, only `method` differs.
    """
    token = (body.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")

    identity = github_service.validate_token(token)

    try:
        github_identity.save_connection(
            user_id,
            token=token,
            login=identity["login"],
            avatar_url=identity["avatar_url"],
            scopes=identity["scopes"],
            method=github_identity.METHOD_TOKEN,
        )
    except RuntimeError as exc:
        # Either encryption is unavailable (TOKEN_ENCRYPTION_KEY unset
        # outside development -- we refuse to store a credential in the
        # clear) or the graph is unreachable. Both are the operator's to
        # fix and neither message contains the token.
        raise HTTPException(status_code=503, detail=str(exc))

    return _status(user_id)


@router.delete("/connection", response_model=DisconnectResponse)
def disconnect(user_id: str = Depends(require_auth)):
    """Forget this account's stored GitHub credential.

    This does not revoke anything at GitHub -- only the user can do that,
    from https://github.com/settings/applications -- so the response says
    so rather than implying a revocation that did not happen.
    """
    try:
        removed = github_identity.delete_connection(user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return DisconnectResponse(
        removed=removed,
        message=(
            "GitHub connection removed. The token is deleted here but is "
            "still valid at GitHub — revoke it at "
            "https://github.com/settings/applications if you want it dead."
            if removed
            else "No GitHub connection was stored for this account."
        ),
    )
