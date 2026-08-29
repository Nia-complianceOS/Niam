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
    graph,
    health,
    scan,
    webhook,
)
from app.api.deps import require_auth

api_router = APIRouter()

# Public routes
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(health.router, prefix="/health", tags=["meta"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])

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
