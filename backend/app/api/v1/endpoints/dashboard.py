"""GET /api/v1/dashboard/summary — stat cards, timeline, commit feed.

The account is taken from the JWT, never from the request. router.py
already mounts this router behind Depends(require_auth); naming the
dependency again here is what gets the user id into the handler, and
FastAPI resolves it once per request either way.
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_auth
from app.schemas.dashboard import DashboardSummaryResponse
from app.services.dashboard_service import get_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryResponse)
def dashboard_summary(user_id: str = Depends(require_auth)):
    return get_dashboard_summary(user_id)
