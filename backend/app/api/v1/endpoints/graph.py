"""GET /api/v1/graph — powers the Compliance Graph page."""

from fastapi import APIRouter, HTTPException

from app.schemas.graph import GraphResponse
from app.services.graph_service import get_compliance_graph

router = APIRouter()


@router.get("", response_model=GraphResponse)
def compliance_graph():
    try:
        return get_compliance_graph()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
