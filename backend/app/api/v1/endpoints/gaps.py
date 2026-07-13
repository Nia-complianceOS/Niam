"""
GET /api/v1/gaps
GET /api/v1/gaps/{gap_id}
POST /api/v1/gaps/{gap_id}/generate-fix
POST /api/v1/gaps/{gap_id}/open-pr

The last route is the one write action that crosses into GitHub —
it calls github_service.open_compliance_pr(), which is stubbed until
Phase C wires in the real PyGithub PR creation flow.
"""

from fastapi import APIRouter

from app.schemas.gaps import Gap, GapsResponse, GenerateFixResponse
from app.schemas.prs import OpenPRResponse
from app.services import gap_service, github_service

router = APIRouter()


@router.get("", response_model=GapsResponse)
def list_gaps():
    return gap_service.list_gaps()


@router.get("/{gap_id}", response_model=Gap)
def get_gap(gap_id: str):
    return gap_service.get_gap(gap_id)


@router.post("/{gap_id}/generate-fix", response_model=GenerateFixResponse)
def generate_fix(gap_id: str):
    drafts = gap_service.generate_fix(gap_id)
    return GenerateFixResponse(gap_id=gap_id, remediation_drafts=drafts)


@router.post("/{gap_id}/open-pr", response_model=OpenPRResponse)
def open_pr(gap_id: str):
    gap = gap_service.get_gap(gap_id)
    pr = github_service.open_compliance_pr(gap)
    gap_service.mark_pr_opened(gap_id, pr.id)
    return OpenPRResponse(pull_request=pr)