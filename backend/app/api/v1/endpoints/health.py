"""GET /api/v1/health — liveness + Neo4j connectivity check."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.db.database import verify_connectivity

router = APIRouter()


@router.get("")
def health_check():
    settings = get_settings()
    return {
        "status": "ok",
        "environment": settings.app_env,
        "neo4j_connected": verify_connectivity(),
    }