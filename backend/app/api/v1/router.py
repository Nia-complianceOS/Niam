"""
Aggregates every endpoint module into one router, mounted in main.py
under settings.api_v1_prefix (default /api/v1).

Adding a new endpoint file later = add one import + one include_router
line here. Nothing else needs to change.
"""

from fastapi import APIRouter, Depends

from app.api.v1.endpoints import (
    auth,
    compliance,
    dashboard,
    gaps,
    github,
    github_oauth,
    graph,
    health,
    scan,
    workspace,
    webhook,
)
from app.api.deps import require_auth

api_router = APIRouter()

# Public routes
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(health.router, prefix="/health", tags=["meta"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])

# The GitHub OAuth pair is mounted OUTSIDE the protected /github router
# below, and this is not an oversight. GET /github/oauth/callback is
# reached by a top-level browser navigation from github.com: there is no
# Authorization header on it and no way for the SPA to add one, so a
# blanket Depends(require_auth) would 401 every successful connection.
# The one-use, expiring `state` minted by /oauth/start is what identifies
# the user on the way back -- see github_oauth.py, which spells out why
# that makes state validation security-critical rather than bookkeeping.
#
# /oauth/start itself IS authenticated, per-route, since it has to know
# which account to mint a state against.
api_router.include_router(
    github_oauth.router, prefix="/github/oauth", tags=["github"]
)

# Protected routes
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    graph.router,
    prefix="/graph",
    tags=["graph"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    gaps.router,
    prefix="/gaps",
    tags=["gaps"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    compliance.router,
    prefix="/compliance",
    tags=["compliance"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    github.router,
    prefix="/github",
    tags=["github"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    scan.router,
    prefix="/scan",
    tags=["scan"],
    dependencies=[Depends(require_auth)],
)
api_router.include_router(
    workspace.router,
    prefix="/workspace",
    tags=["workspace"],
    dependencies=[Depends(require_auth)],
)
