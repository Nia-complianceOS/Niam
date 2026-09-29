"""Authentication: password signup and login, sign in with GitHub, and
session restore.

Sign in with GitHub shares its callback with "connect GitHub"
(github_oauth.py). A new GitHub user gets an account, a personal
workspace AND a repository connection in one step, so the Repositories
page is already connected. An existing password account is never linked
by matching emails; the person signs in with the password and connects
GitHub, which links it (see services/github_signin.py).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.api.deps import Workspace, current_workspace, require_auth
from app.core import auth
from app.core.limiter import limiter
from app.services import (
    github_identity,
    github_signin,
    membership_service,
    user_service,
)

router = APIRouter()


def _check_password(v: str) -> str:
    weak_passwords = {"password", "12345678", "123456789", "qwertyui"}
    if v.lower() in weak_passwords:
        raise ValueError("Password is too weak")
    # bcrypt reads only the first 72 bytes; refusing longer is better than
    # silently ignoring the rest of someone's passphrase.
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password is too long (72 bytes maximum)")
    return v


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: EmailStr
    name: str | None = None
    # True only for a GitHub sign-in that created the account just now.
    new_account: bool = False


class WorkspaceInfo(BaseModel):
    workspace_id: str
    name: str
    role: str
    personal: bool


class MeResponse(BaseModel):
    user_id: str
    email: EmailStr
    name: str | None = None
    has_password: bool = True
    github_login: str | None = None
    workspace_id: str
    role: str
    workspaces: list[WorkspaceInfo] = []


class SseTokenResponse(BaseModel):
    sse_token: str


class GithubExchange(BaseModel):
    code: str
    verifier: str


class SetPassword(BaseModel):
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _check_password(v)


def _token_response(user: user_service.User, new_account: bool = False) -> TokenResponse:
    return TokenResponse(
        access_token=auth.create_access_token(subject=user.id),
        user_id=user.id,
        email=user.email,
        name=user.name,
        new_account=new_account,
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(request: Request, data: UserCreate):
    if user_service.get_user_by_email(data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        user = user_service.create_user(
            email=data.email,
            hashed_password=auth.get_password_hash(data.password),
            name=data.name,
        )
    except RuntimeError as exc:
        # Two signups racing for one email: the unique constraint wins,
        # and the loser gets the same answer as above rather than a 500.
        if "duplicate" in str(exc).lower() or "23505" in str(exc):
            raise HTTPException(status_code=400, detail="Email already registered")
        raise HTTPException(status_code=503, detail="Could not create the account")
    membership_service.create_personal_workspace(user.id, user.name, user.email)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, data: UserLogin):
    user = user_service.get_user_by_email(data.email)
    hashed = user.hashed_password if user else None
    # Verify against a dummy hash when there is no user (or no password),
    # so the response time does not reveal which emails have accounts.
    ok = auth.verify_password(data.password, hashed or auth.DUMMY_HASH)
    if not user or not hashed or not ok:
        if user and not hashed:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This account signs in with GitHub. Use Continue with GitHub.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return _token_response(user)


@router.get("/me", response_model=MeResponse)
def me(ws: Workspace = Depends(current_workspace)):
    """Who the bearer token belongs to, and which workspace they are in.

    The client calls this on load instead of trusting whatever is in
    localStorage. A token for a deleted account fails here.
    """
    user = user_service.get_user_by_id(ws.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists",
        )
    github = next(
        (
            i
            for i in user_service.identities_for_user(user.id)
            if i.get("provider") == user_service.PROVIDER_GITHUB
        ),
        None,
    )
    rows = membership_service.memberships(user.id) or [
        {
            "workspace_id": user.id,
            "name": "My workspace",
            "role": "owner",
            "personal": True,
        }
    ]
    return MeResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        has_password=bool(user.hashed_password),
        github_login=(github or {}).get("login"),
        workspace_id=ws.workspace_id,
        role=ws.role,
        workspaces=[
            WorkspaceInfo(
                workspace_id=r["workspace_id"],
                name=r.get("name") or "Workspace",
                role=r["role"],
                personal=bool(r.get("personal")),
            )
            for r in rows
        ],
    )


@router.post("/sse-token", response_model=SseTokenResponse)
def get_sse_token(user_id: str = Depends(require_auth)):
    """A five-minute ticket accepted only by the scan progress stream."""
    return SseTokenResponse(sse_token=auth.create_sse_token(user_id))


@router.post("/password", status_code=204)
def set_password(body: SetPassword, user_id: str = Depends(require_auth)):
    """Set or change the password. How a GitHub-only account adds a second
    way to sign in."""
    user_service.set_password(user_id, auth.get_password_hash(body.password))


@router.delete("/github", status_code=204)
def unlink_github(user_id: str = Depends(require_auth)):
    """Stop signing in with GitHub. Refused when it is the only way in."""
    user = user_service.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    if not user.hashed_password:
        raise HTTPException(
            status_code=409,
            detail="Set a password first: GitHub is currently your only way to sign in.",
        )
    user_service.unlink_identity(user_id, user_service.PROVIDER_GITHUB)


# --- sign in with GitHub ------------------------------------------------


@router.get("/github/start")
@limiter.limit("20/minute")
def github_start(
    request: Request,
    binding: str = Query(..., description="SHA-256 hex of the SPA's verifier"),
):
    """Public. Returns the GitHub authorize URL for a sign-in."""
    from app.api.v1.endpoints.github_oauth import start_flow

    return start_flow(github_identity.PURPOSE_LOGIN, None, binding)


@router.post("/github/exchange", response_model=TokenResponse)
@limiter.limit("20/minute")
def github_exchange(request: Request, body: GithubExchange):
    """Public. Swap the one-time completion code (plus this browser's
    verifier) for a session. Error details are reason codes the SPA
    translates: account_exists_link_required, email_unverified,
    expired_code, browser_mismatch, invalid_state."""
    try:
        row = github_signin.redeem(body.code, body.verifier, github_identity.PURPOSE_LOGIN)
        user, created = github_signin.finish_login(row)
    except github_signin.FlowError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.reason)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="storage_failed") from exc
    return _token_response(user, new_account=created)
