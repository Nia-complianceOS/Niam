"""Real authentication: signup, login, and session restore.

These routes were always implemented -- JWT issuing in core/auth.py,
:User nodes with hashed passwords in services/user_service.py -- and the
frontend simply never called them, handing out a fixed bypass token
instead (ACTION_PLAN D1). D1 was agreed on the premise "a hackathon with
no real customers"; that premise ended when this became a deployed,
publicly linked project, so the bypass is gone and these are the only way
in.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from app.api.deps import require_auth
from app.services import user_service
from app.core import auth
from app.core.limiter import limiter

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        weak_passwords = {"password", "12345678", "123456789", "qwertyui"}
        if v.lower() in weak_passwords:
            raise ValueError("Password is too weak")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    # Returned so the client can render the signed-in user without a
    # second round trip, and without inventing a display name locally the
    # way the old mock path did ("Admin Workspace").
    email: EmailStr
    name: str | None = None


class MeResponse(BaseModel):
    user_id: str
    email: EmailStr
    name: str | None = None


class SseTokenResponse(BaseModel):
    sse_token: str


@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
def signup(request: Request, data: UserCreate):
    existing_user = user_service.get_user_by_email(data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth.get_password_hash(data.password)
    user = user_service.create_user(
        email=data.email, hashed_password=hashed_password, name=data.name
    )

    access_token = auth.create_access_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, data: UserLogin):
    user = user_service.get_user_by_email(data.email)
    if not user or not auth.verify_password(
        data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = auth.create_access_token(subject=user.id)
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
    )


@router.get("/me", response_model=MeResponse)
def me(user_id: str = Depends(require_auth)):
    """Who the bearer token belongs to.

    The client calls this on load instead of trusting whatever user object
    is sitting in localStorage. A token that has expired, been revoked by
    a JWT_SECRET rotation, or belongs to a deleted account fails here and
    the session is cleared -- rather than the app rendering a signed-in
    shell whose every request then 401s.
    """
    user = user_service.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists",
        )
    return MeResponse(user_id=user.id, email=user.email, name=user.name)


@router.post("/sse-token", response_model=SseTokenResponse)
def get_sse_token(user_id: str = Depends(require_auth)):
    """Issues a short-lived token specifically for SSE connections."""
    token = auth.create_sse_token(user_id)
    return SseTokenResponse(sse_token=token)
