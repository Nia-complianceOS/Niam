"""
GET /api/v1/gaps
GET /api/v1/gaps/{gap_id}
POST /api/v1/gaps/{gap_id}/generate-fix
POST /api/v1/gaps/{gap_id}/open-pr

The last route is the one write action that crosses into GitHub. It is
NOT a stub -- github_service.open_compliance_pr() creates branches,
commits files and opens pull requests with GITHUB_TOKEN. It is guarded
three ways: GITHUB_DRY_RUN (default true) logs the intent and creates
nothing, PR_ALLOWED_REPOS is an explicit allow-list that denies
everything when empty, and the target repo comes only from the gap's
own source commit -- there is no fallback.

Every route takes the account from the JWT (Depends(require_auth)) and
hands it to gap_service as the first argument. The gap id in the path is
user-supplied and is never trusted on its own: a gap belonging to another
account 404s, identically to one that does not exist. That matters most
on open-pr, where acting on somebody else's gap would push a commit to
their repository.
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_auth
from app.schemas.gaps import Gap, GapsResponse, GenerateFixResponse
from app.schemas.prs import OpenPRResponse
from app.services import gap_service, github_service

router = APIRouter()


@router.get("", response_model=GapsResponse)
def list_gaps(user_id: str = Depends(require_auth)):
    return gap_service.list_gaps(user_id)


@router.get("/{gap_id}", response_model=Gap)
def get_gap(gap_id: str, user_id: str = Depends(require_auth)):
    return gap_service.get_gap(user_id, gap_id)


@router.post("/{gap_id}/generate-fix", response_model=GenerateFixResponse)
def generate_fix(gap_id: str, user_id: str = Depends(require_auth)):
    drafts = gap_service.generate_fix(user_id, gap_id)
    return GenerateFixResponse(gap_id=gap_id, remediation_drafts=drafts)


@router.post("/{gap_id}/open-pr", response_model=OpenPRResponse)
def open_pr(gap_id: str, user_id: str = Depends(require_auth)):
    # get_gap() first, and not only to load the gap: it is the ownership
    # check that stands between a guessed gap id and a branch pushed to
    # somebody else's repository.
    gap = gap_service.get_gap(user_id, gap_id)
    pr = github_service.open_compliance_pr(user_id, gap)
    gap_service.mark_pr_opened(user_id, gap_id, pr.id)
    return OpenPRResponse(pull_request=pr)
