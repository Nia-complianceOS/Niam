"""
Aggregates every endpoint module into one router, mounted in main.py
under settings.api_v1_prefix (default /api/v1).

Adding a new endpoint file later = add one import + one include_router
line here. Nothing else needs to change.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import compliance, dashboard, gaps, github, graph, health, webhook

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["meta"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(graph.router, prefix="/graph", tags=["graph"])
api_router.include_router(gaps.router, prefix="/gaps", tags=["gaps"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["compliance"])
api_router.include_router(github.router, prefix="/github", tags=["github"])
api_router.include_router(webhook.router, prefix="/webhook", tags=["webhook"])