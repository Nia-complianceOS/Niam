"""
GET /api/v1/github/oauth/start     — authenticated; returns the authorize URL
GET /api/v1/github/oauth/callback  — UNAUTHENTICATED; GitHub redirects here

The GitHub OAuth flow, which is how a user connects their own account so
that scans read their repositories and a pull request is opened as them.

WHY THIS IS A SEPARATE FILE FROM github.py: the callback cannot be behind
Depends(require_auth). The browser arrives on a top-level navigation from
github.com — no Authorization header, no way to add one, and no cookie
session in this app (auth is a bearer JWT held in the SPA). So the
callback is mounted outside the /github router's blanket auth dependency,
and it must be read as a public route.

WHICH MAKES `state` THE AUTHENTICATION, not CSRF bookkeeping. It is the
only thing tying the code GitHub hands back to a Niam account. If it were
guessable, replayable or unbound, an attacker could attach their own
GitHub account to a victim's Niam account (and then read every scan run
against it), or attach a victim's GitHub account to their own. So
github_identity mints 256 bits from secrets.token_urlsafe, stores it
against the user with a 10-minute expiry, and DELETEs it as it reads it —
one use, no exceptions, and an unknown state is refused without saying
which of the three reasons applied.

/start does NOT redirect server-side. It returns the URL as JSON so the
SPA navigates the top-level window itself: a 302 out of an XHR is either
followed opaquely by fetch() or dropped by CORS, and either way the user
never sees GitHub's consent screen. The SPA does `window.location.href =
authorize_url`.

The callback never renders anything. It 302s back to FRONTEND_URL with
?github=connected or ?github=error&reason=..., because at that moment the
browser is on the API origin with no application loaded, and an error
rendered here is a dead end with no way back into the app.
"""

import logging
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import require_auth
from app.core import crypto
from app.core.config import get_settings
from app.services import github_identity, github_service

logger = logging.getLogger("niam.github.oauth")

router = APIRouter()

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

# `repo` covers private repositories, which is the whole point — a
# compliance scan that can only read public code is a demo. `read:user`
# is what gives the connection a login and an avatar to show, so the
# Repositories page can say WHOSE account is connected. Nothing here asks
# for org admin, delete_repo, or workflow: this tool reads code and opens
# pull requests, and a scope it does not need is a scope it should not
# hold when the token is stolen.
OAUTH_SCOPES = "repo read:user"

# The user is waiting on this exchange.
GITHUB_TIMEOUT = 10


class OAuthStartResponse(BaseModel):
    authorize_url: str
    # Returned so the SPA can correlate the tab it opened with the
    # callback it eventually gets back. It is NOT a secret the client
    # needs to keep — the server already holds the only copy that counts.
    state: str


def _redirect(reason: str | None = None) -> RedirectResponse:
    """Back to the SPA, always. See the module docstring."""
    base = get_settings().frontend_url.rstrip("/")
    if reason:
        query = urlencode({"github": "error", "reason": reason})
    else:
        query = urlencode({"github": "connected"})
    # 302, not 307: this is a GET landing page, and a 307 would preserve
    # a method nothing here wants preserved.
    return RedirectResponse(url=f"{base}/repositories?{query}", status_code=302)


def _require_oauth_app() -> tuple[str, str]:
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
    return settings.github_client_id, settings.github_client_secret


@router.get("/start", response_model=OAuthStartResponse)
def start(user_id: str = Depends(require_auth)):
    """Mint a state and hand the SPA the URL to navigate to."""
    client_id, _ = _require_oauth_app()
    settings = get_settings()

    # Checked BEFORE sending the user to GitHub, not after they come
    # back. Discovering at the callback that we cannot store the token
    # means the user has already granted access to an app that then
    # tells them it failed — and the grant stays on their account.
    if not crypto.is_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "TOKEN_ENCRYPTION_KEY is not configured, so a GitHub token "
                "cannot be stored safely. Set it before connecting."
            ),
        )

    try:
        state = github_identity.create_state(user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    params = {
        "client_id": client_id,
        "scope": OAUTH_SCOPES,
        "state": state,
        "allow_signup": "false",
    }
    # Sent only when configured. GitHub validates it against the URIs
    # registered on the app and rejects anything else, so this cannot be
    # used to point a stolen client_id somewhere else -- it only selects
    # WHICH registered URI to use, which is what lets one OAuth App serve
    # both localhost and production. Omitted, GitHub falls back to the
    # app's registered callback, correct when there is exactly one.
    if settings.github_oauth_redirect_uri:
        params["redirect_uri"] = settings.github_oauth_redirect_uri
    return OAuthStartResponse(
        authorize_url=f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}",
        state=state,
    )


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None):
    """Where GitHub sends the browser. Unauthenticated by necessity.

    Returns a redirect in every case, including every failure: the user
    is sitting on the API origin with no application loaded, so the only
    useful thing this can do is put them back in the SPA with a reason
    it can render. Nothing here echoes `code`, `state` or the token into
    the redirect, a log line, or an error.
    """
    # Not _require_oauth_app(): a 503 body rendered on the API origin is
    # a dead end with no way back into the app, and this is an operator
    # error the user can do nothing about. Redirect with a reason like
    # every other failure here.
    settings = get_settings()
    client_id = settings.github_client_id
    client_secret = settings.github_client_secret
    if not client_id or not client_secret:
        logger.error(
            "GitHub redirected to the OAuth callback but this instance has "
            "no GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET configured"
        )
        return _redirect("oauth_not_configured")

    if not code or not state:
        return _redirect("missing_code")

    # One use. An unknown, replayed or expired state is refused
    # identically -- the difference is not the caller's business, and
    # spelling it out helps only someone probing.
    try:
        owner_id = github_identity.consume_state(state)
    except RuntimeError as exc:
        logger.error("Could not validate OAuth state: %s", exc)
        return _redirect("graph_unavailable")

    if not owner_id:
        logger.warning("Rejected a GitHub OAuth callback with an invalid state")
        return _redirect("invalid_state")

    try:
        resp = requests.post(
            GITHUB_TOKEN_URL,
            # redirect_uri must be repeated here, byte-identical to the
            # one sent to /authorize. GitHub compares them and refuses the
            # code if they differ -- which surfaces as exchange_failed,
            # with nothing in the message to say the URIs disagreed.
            data={
                "client_id": client_id,
                "client_secret": client_secret,
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
        return _redirect("github_unreachable")

    if resp.status_code != 200:
        logger.error("GitHub token exchange returned %s", resp.status_code)
        return _redirect("exchange_failed")

    try:
        payload = resp.json()
    except ValueError:
        return _redirect("exchange_failed")

    # GitHub answers 200 with {"error": "bad_verification_code"} for a
    # reused or expired code, so the status alone proves nothing.
    if payload.get("error"):
        logger.error(
            "GitHub refused the code exchange: %s", payload.get("error")
        )
        return _redirect("exchange_failed")

    token = payload.get("access_token")
    if not token:
        return _redirect("exchange_failed")

    # Scopes as GitHub actually granted them, which can be narrower than
    # what was asked for -- a user can decline private-repo access on the
    # consent screen. Storing the request instead of the grant would make
    # the UI claim an access level the token does not have.
    granted = [
        s.strip() for s in (payload.get("scope") or "").split(",") if s.strip()
    ]

    try:
        identity = github_service.validate_token(token)
    except HTTPException:
        # A token GitHub just issued that GitHub then rejects is not a
        # user error; there is nothing for them to do but retry.
        logger.error("A freshly issued GitHub token failed validation")
        return _redirect("validation_failed")

    try:
        github_identity.save_connection(
            owner_id,
            token=token,
            login=identity["login"],
            avatar_url=identity["avatar_url"],
            scopes=granted or identity["scopes"],
            method=github_identity.METHOD_OAUTH,
        )
    except (RuntimeError, ValueError) as exc:
        # Encryption unavailable, or the graph is down. Neither message
        # goes to the browser -- it gets a reason code.
        logger.error("Could not store the GitHub connection: %s", exc)
        return _redirect("storage_failed")

    return _redirect()
