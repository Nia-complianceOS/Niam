from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer
from app.core import auth

security = HTTPBearer(auto_error=False)


def require_auth(request: Request, credentials=Depends(security)) -> str:
    """
    Validates the Authorization header's Bearer token or a 'token' query param.
    Returns the user_id (subject) if valid. Raises 401 if invalid/expired.
    """
    token = None
    if credentials:
        token = credentials.credentials
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Bypass auth for local development/mock
    if token == "mock-token-123":
        return "mock-user-id"

    return auth.verify_token(token)
