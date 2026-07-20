"""
GitHub-facing operations: repository listing and PR creation.

open_compliance_pr() is stubbed for now — it returns a mock PullRequest
instead of calling the real GitHub API via PyGithub. Phase C swaps the
body for the real create_git_ref/update_file/create_pull sequence from
the onboarding doc, using GITHUB_TOKEN from app/core/config.py.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.common import ComplianceStatus, PRStatus
from app.schemas.gaps import Gap
from app.schemas.prs import PullRequest, PRsResponse
from app.schemas.repos import Repository, ReposResponse

_NOW = lambda: datetime.now(timezone.utc)  # noqa: E731

_PRS: dict[str, PullRequest] = {}


def list_repositories() -> ReposResponse:
    now = _NOW()
    return ReposResponse(repositories=[
        Repository(id="r1", full_name="nova-labs/checkout-service", branch="main", score=73,
                    last_scanned_at=(now - timedelta(minutes=4)).isoformat(),
                    status=ComplianceStatus.WARNING, status_detail="Drift Detected"),
        Repository(id="r2", full_name="nova-labs/auth-service", branch="main", score=91,
                    last_scanned_at=(now - timedelta(hours=1)).isoformat(),
                    status=ComplianceStatus.COMPLIANT, status_detail="Healthy"),
        Repository(id="r3", full_name="nova-labs/marketing-site", branch="main", score=88,
                    last_scanned_at=(now - timedelta(hours=3)).isoformat(),
                    status=ComplianceStatus.COMPLIANT, status_detail="Healthy"),
        Repository(id="r4", full_name="nova-labs/support-ai", branch="develop", score=64,
                    last_scanned_at=(now - timedelta(hours=6)).isoformat(),
                    status=ComplianceStatus.WARNING, status_detail="Retention Gap"),
    ])


def list_pull_requests() -> PRsResponse:
    return PRsResponse(pull_requests=list(_PRS.values()))


def open_compliance_pr(gap: Gap) -> PullRequest:
    """
    STUB: does not call the real GitHub API yet. Returns a mock
    PullRequest built from the gap's already-drafted remediation
    content, so the /open-pr endpoint and Frontend's PR review modal
    can be built and tested end-to-end before real PyGithub wiring
    lands in Phase C.

    Raises HTTPException(400) if the gap has no remediation drafts yet
    — a PR should never be opened for a gap where generate-fix hasn't
    run, and the endpoint should surface that as a clear 400 rather
    than opening an empty PR or letting an unhandled error become a
    generic 500.
    """
    if not gap.remediation_drafts:
        raise HTTPException(
            status_code=400,
            detail=f"Gap '{gap.id}' has no remediation drafts yet — call generate-fix before open-pr",
        )

    pr_id = f"pr-{len(_PRS) + 300}"
    now = _NOW()
    pr = PullRequest(
        id=pr_id,
        gap_id=gap.id,
        title=f"Compliance Update: {gap.vendor or gap.title}",
        repo_full_name=gap.source_commit.repo if gap.source_commit else "nova-labs/checkout-service",
        status=PRStatus.READY_FOR_REVIEW,
        opened_by="continuum-bot",
        reviewer="Legal Team",
        regulations=gap.regulations,
        files=gap.remediation_drafts,
        github_pr_url=None,  # populated once real GitHub API call lands
        opened_at=now.isoformat(),
        updated_at=now.isoformat(),
    )
    _PRS[pr_id] = pr
    return pr
