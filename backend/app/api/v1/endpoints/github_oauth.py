"""
GET  /api/v1/github/oauth/start     — authenticated (workspace owner); connect GitHub
GET  /api/v1/github/oauth/callback  — UNAUTHENTICATED; GitHub redirects here
POST /api/v1/github/oauth/exchange  — authenticated; finish a connect flow

Sign in with GitHub uses the same callback; its start and exchange routes
live in auth.py because they are public.

THE CALLBACK DOES NOT DECIDE THE ACCOUNT ANY MORE. It exchanges the code,
reads the GitHub user, parks the result under a one-time code and sends
the browser to the SPA's /auth/github/complete page. The SPA finishes the
flow by POSTing that code with the verifier whose SHA-256 it sent at
start (kept in sessionStorage). See services/github_signin.py for why:
previously the `state` alone chose the account, so a connect URL sent to
somebody else attached their GitHub token to the sender's account.

/start returns the URL as JSON rather than redirecting: a 302 out of an
XHR is either followed opaquely by fetch() or dropped by CORS.
"""

import logging
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import Workspace, require_role, ROLE_OWNER
from app.core import crypto
from app.core.config import get_settings
from app.services import github_identity, github_service, github_signin

logger = logging.getLogger("niam.github.oauth")

router = APIRouter()

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

# `repo` covers private repositories and is what lets Niam open the fix
# pull request; GitHub describes it as full read/write on repositories,
# and the UI says so. `read:user` gives the login and avatar;
# `user:email` is what lets a GitHub sign-in read a VERIFIED email. No
# org admin, delete_repo or workflow.
OAUTH_SCOPES = "repo read:user user:email"

GITHUB_TIMEOUT = 10


class OAuthStartResponse(BaseModel):
    authorize_url: str
    state: str


class ExchangeRequest(BaseModel):
    code: str
    verifier: str


class ConnectExchangeResponse(BaseModel):
    login: str | None = None
    linked_for_signin: bool = False


def _complete_redirect(**params: str) -> RedirectResponse:
    """Back to the SPA's completion page, always. The SPA knows from its
    own sessionStorage whether it was signing in or connecting."""
    base = get_settings().frontend_url.rstrip("/")
    return RedirectResponse(
        url=f"{base}/auth/github/complete?{urlencode(params)}", status_code=302
    )


def require_oauth_app() -> tuple[str, str]:
    settings = get_settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "GitHub OAuth is not configured on this instance. Set "
                "GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or connect by "
                "pasting a personal access token instead."
            ),
        )
    if not crypto.is_available():
        # Checked BEFORE sending the user to GitHub: discovering at the
        # callback that the token cannot be stored leaves a grant on
        # their account for an app that then says it failed.
        raise HTTPException(
            status_code=503,
            detail=(
                "TOKEN_ENCRYPTION_KEY is not configured, so a GitHub token "
                "cannot be stored safely. Set it before connecting."
            ),
        )
    return settings.github_client_id, settings.github_client_secret


def authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "scope": OAUTH_SCOPES,
        "state": state,
        "allow_signup": "true",
    }
    # Selects WHICH registered redirect URI to use, which lets one OAuth
    # App serve both localhost and production. GitHub rejects any URI
    # that is not registered on the app.
    if settings.github_oauth_redirect_uri:
        params["redirect_uri"] = settings.github_oauth_redirect_uri
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


def start_flow(purpose: str, user_id: str | None, binding: str) -> OAuthStartResponse:
    require_oauth_app()
    if not github_signin.valid_binding(binding):
        raise HTTPException(
            status_code=422,
            detail="binding must be the SHA-256 hex digest of a random verifier",
        )
    try:
        state = github_identity.create_state(user_id, purpose, binding)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return OAuthStartResponse(authorize_url=authorize_url(state), state=state)


@router.get("/start", response_model=OAuthStartResponse)
def start(
    binding: str = Query(..., description="SHA-256 hex of the SPA's verifier"),
    ws: Workspace = Depends(require_role(ROLE_OWNER)),
):
    """Connect GitHub to the current workspace (owners only)."""
    return start_flow(github_identity.PURPOSE_CONNECT, ws.user_id, binding)


@router.get("/callback")
def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Where GitHub sends the browser. Unauthenticated by necessity.

    Redirects in every case. Never echoes the code, state or token into a
    redirect, log line or error.
    """
    settings = get_settings()
    if error:
        # The user pressed Cancel on GitHub's consent screen.
        return _complete_redirect(error="access_denied")
    if not settings.github_client_id or not settings.github_client_secret:
        logger.error("OAuth callback reached but GITHUB_CLIENT_ID/SECRET are unset")
        return _complete_redirect(error="oauth_not_configured")
    if not code or not state:
        return _complete_redirect(error="missing_code")

    try:
        state_row = github_identity.consume_state(state)
    except RuntimeError as exc:
        logger.error("Could not validate OAuth state: %s", exc)
        return _complete_redirect(error="storage_failed")
    if not state_row or not state_row.get("browser_binding"):
        logger.warning("Rejected a GitHub OAuth callback with an invalid state")
        return _complete_redirect(error="invalid_state")

    try:
        resp = requests.post(
            GITHUB_TOKEN_URL,
            # redirect_uri repeated byte-identical to /authorize, or GitHub
            # refuses the code with nothing in the message about URIs.
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "state": state,
                **(
                    {"redirect_uri": settings.github_oauth_redirect_uri}
                    if settings.github_oauth_redirect_uri
                    else {}
                ),
            },
            headers={"Accept": "application/json"},
            timeout=GITHUB_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("GitHub token exchange failed: %s", exc.__class__.__name__)
        return _complete_redirect(error="github_unreachable")

    try:
        payload = resp.json() if resp.status_code == 200 else {}
    except ValueError:
        payload = {}
    # GitHub answers 200 with {"error": "bad_verification_code"} for a
    # reused code, so the status alone proves nothing.
    token = payload.get("access_token") if not payload.get("error") else None
    if not token:
        logger.error("GitHub refused the code exchange: %s", payload.get("error") or resp.status_code)
        return _complete_redirect(error="exchange_failed")

    granted = [s.strip() for s in (payload.get("scope") or "").split(",") if s.strip()]

    try:
        identity = github_service.validate_token(token)
    except HTTPException:
        logger.error("A freshly issued GitHub token failed validation")
        return _complete_redirect(error="validation_failed")
    if not identity.get("id"):
        return _complete_redirect(error="validation_failed")

    email, verified = github_service.primary_verified_email(token)

    try:
        completion = github_signin.park_completion(
            state_row, token, identity, email, verified, granted or identity["scopes"]
        )
    except Exception as exc:
        logger.error("Could not park the GitHub completion: %s", exc)
        return _complete_redirect(error="storage_failed")

    return _complete_redirect(code=completion, purpose=state_row["purpose"])


@router.post("/exchange", response_model=ConnectExchangeResponse)
def exchange(
    body: ExchangeRequest,
    ws: Workspace = Depends(require_role(ROLE_OWNER)),
):
    """Finish a connect flow started by this user, in this browser."""
    try:
        row = github_signin.redeem(
            body.code, body.verifier, github_identity.PURPOSE_CONNECT
        )
        result = github_signin.finish_connect(row, ws.user_id, ws.workspace_id)
    except github_signin.FlowError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.reason)
    except (RuntimeError, ValueError) as exc:
        logger.error("Could not store the GitHub connection: %s", exc)
        raise HTTPException(status_code=503, detail="storage_failed")
    return ConnectExchangeResponse(**result)
