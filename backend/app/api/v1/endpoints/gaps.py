"""
GET  /api/v1/gaps
GET  /api/v1/gaps/{gap_id}
POST /api/v1/gaps/{gap_id}/generate-fix
POST /api/v1/gaps/{gap_id}/open-pr

Every route is scoped to the caller's workspace (deps.require_owner_id).
A gap id in the path is user-supplied and never trusted: another
workspace's gap 404s exactly like one that does not exist.

generate-fix drafts the amendment AND sends it to legal review. open-pr
no longer opens anything on its own: a pull request opens only when a
finding's review has owner approval (review_service). The route stays so
an owner can retry a pull request that GitHub refused after approval.
"""

from fastapi import APIRouter, Depends

from app.api.deps import (
    ROLE_LEGAL,
    ROLE_MEMBER,
    ROLE_OWNER,
    Workspace,
    require_owner_id,
    require_role,
)
from app.schemas.gaps import Gap, GapsResponse, GenerateFixResponse
from app.services import gap_service, review_service

router = APIRouter()


@router.get("", response_model=GapsResponse)
def list_gaps(owner_id: str = Depends(require_owner_id)):
    resp = gap_service.list_gaps(owner_id)
    resp.gaps = review_service.apply_to_gaps(owner_id, resp.gaps)
    resp.open_gap_count = sum(
        1 for g in resp.gaps if g.status not in ("resolved", "dismissed", "risk_accepted")
    )
    return resp


@router.get("/{gap_id}", response_model=Gap)
def get_gap(gap_id: str, owner_id: str = Depends(require_owner_id)):
    gap = gap_service.get_gap(owner_id, gap_id)
    return review_service.apply_to_gaps(owner_id, [gap])[0]


@router.post("/{gap_id}/generate-fix", response_model=GenerateFixResponse)
def generate_fix(
    gap_id: str,
    ws: Workspace = Depends(require_role(ROLE_OWNER, ROLE_MEMBER, ROLE_LEGAL)),
):
    drafts = gap_service.generate_fix(ws.workspace_id, gap_id)
    gap = gap_service.get_gap(ws.workspace_id, gap_id)
    review = review_service.start_review(ws, gap)
    return GenerateFixResponse(
        gap_id=gap_id,
        remediation_drafts=drafts,
        review_id=review["id"],
        review_state=review["state"],
    )


@router.post("/{gap_id}/open-pr")
def open_pr(gap_id: str, ws: Workspace = Depends(require_role(ROLE_OWNER))):
    """Retry opening the pull request for an owner-approved finding."""
    return review_service.open_pr_for_gap(ws, gap_id)
