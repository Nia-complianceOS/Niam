import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from fastapi import HTTPException, status
from app.core.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(
    subject: str, expires_delta: timedelta = timedelta(hours=2)
) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret, algorithm=ALGORITHM
    )
    return encoded_jwt


def create_sse_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    to_encode = {"exp": expire, "sub": str(subject), "type": "sse"}
    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret, algorithm=ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str, expected_type: str | None = None) -> str:
    """Returns the sub (user_id) if valid, raises HTTPException(401) otherwise."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[ALGORITHM]
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
            )
            
        token_type = payload.get("type")
        if expected_type == "sse" and token_type != "sse":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SSE ticket required",
            )
        if expected_type is None and token_type == "sse":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SSE ticket not allowed for general authentication",
            )
            
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
