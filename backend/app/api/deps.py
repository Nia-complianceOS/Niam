"""
Request dependencies.

AUTHENTICATION IS REAL. Every route marked "Protected" in router.py
requires a valid JWT issued by POST /api/v1/auth/login or /auth/signup.

This file used to carry a hardcoded bypass: any request presenting the
literal token "mock-token-123" was authenticated as a fixed user, and
frontend/src/context/AuthContext.tsx handed that token to anyone who
submitted the login form. It was a deliberate decision (ACTION_PLAN D1)
on the stated premise of "a hackathon with no real customers", and it
was guarded so it only worked when APP_ENV == "development".

That premise ended when this became a deployed, publicly linked
project. The guard was never the real protection either -- it made a
misconfigured deployment fail closed, but it did nothing about the
actual risk, which is that POST /gaps/{id}/open-pr creates branches and
pull requests using GITHUB_TOKEN. An unauthenticated caller reaching
that route is a remote-controlled PR bot operating as you.

So the bypass is deleted rather than re-guarded. The machinery it was
standing in for was complete the whole time: core/auth.py issues and
verifies the JWTs, and services/user_service.py stores :User nodes with
passlib-hashed passwords in the same Neo4j instance as the graph.
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer

from app.core import auth

security = HTTPBearer(auto_error=False)


def require_auth(request: Request, credentials=Depends(security)) -> str:
    """
    Validates the Authorization header's Bearer token or a 'token' query
    param. Returns the user_id (subject) if valid. Raises 401 otherwise.

    The query-param path exists for EventSource: the browser's SSE client
    cannot set headers, so GET /scan/{id}/events passes the token in the
    URL. That is a real trade -- tokens in query strings end up in server
    logs and browser history -- and it is accepted here because the
    alternative is no auth at all on the scan stream. Tokens expire in
    two hours (core/auth.py).
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

    return auth.verify_token(token)
