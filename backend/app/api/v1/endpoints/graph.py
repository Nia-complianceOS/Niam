"""GET /api/v1/graph — powers the Compliance Graph page.

Returns only the caller's own subgraph: their systems, data types and
vendors, plus the DPDP clauses those data types are governed by. An
account that has not scanned anything gets empty node and edge lists,
which the page renders as an empty canvas rather than as an error.
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import require_auth
from app.schemas.graph import GraphResponse
from app.services.graph_service import (
    DEFAULT_NODE_LIMIT,
    MAX_NODE_LIMIT,
    get_compliance_graph,
)

router = APIRouter()


@router.get("", response_model=GraphResponse)
def compliance_graph(
    limit: int = Query(
        DEFAULT_NODE_LIMIT,
        ge=1,
        le=MAX_NODE_LIMIT,
        description=(
            "Maximum nodes to return. Clauses are dropped before the "
            "System/DataType/Vendor flow map. The response reports "
            "total_nodes and truncated so the UI can say what it is showing."
        ),
    ),
    user_id: str = Depends(require_auth),
):
    try:
        return get_compliance_graph(user_id, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
