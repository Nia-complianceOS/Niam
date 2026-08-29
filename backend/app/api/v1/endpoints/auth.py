from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from app.services import user_service
from app.core import auth

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(data: UserCreate):
    existing_user = user_service.get_user_by_email(data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth.get_password_hash(data.password)
    user = user_service.create_user(
        email=data.email, hashed_password=hashed_password
    )

    access_token = auth.create_access_token(subject=user.id)
    return TokenResponse(access_token=access_token, user_id=user.id)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin):
    user = user_service.get_user_by_email(data.email)
    if not user or not auth.verify_password(
        data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = auth.create_access_token(subject=user.id)
    return TokenResponse(access_token=access_token, user_id=user.id)
