"""
GitHub-facing operations: repository listing and PR creation.

open_compliance_pr() is stubbed for now — it returns a mock PullRequest
instead of calling the real GitHub API via PyGithub. Phase C swaps the
body for the real create_git_ref/update_file/create_pull sequence from
the onboarding doc, using GITHUB_TOKEN from app/core/config.py.
"""

from datetime import datetime, timedelta, timezone

from app.schemas.common import ComplianceStatus, RegulationCode, PRStatus
from app.schemas.repos import Repository, ReposResponse
from app.schemas.gaps import Gap
from app.schemas.prs import PullRequest, PRsResponse

_NOW = lambda: datetime.now(timezone.utc)  # noqa: E731

_PRS: dict[str, PullRequest] = {}


def list_repositories() -> ReposResponse:
    now = _NOW()
    return ReposResponse(repositories=[
        Repository(id="r1", full_name="nova-labs/checkout-service", score=73,
                    last_scanned_at=now - timedelta(minutes=4),
                    status=ComplianceStatus.WARNING, status_detail="Drift Detected"),
        Repository(id="r2", full_name="nova-labs/auth-service", score=91,
                    last_scanned_at=now - timedelta(hours=1),
                    status=ComplianceStatus.COMPLIANT, status_detail="Healthy"),
        Repository(id="r3", full_name="nova-labs/marketing-site", score=88,
                    last_scanned_at=now - timedelta(hours=3),
                    status=ComplianceStatus.COMPLIANT, status_detail="Healthy"),
        Repository(id="r4", full_name="nova-labs/support-ai", score=64,
                    last_scanned_at=now - timedelta(hours=6),
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
    """
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
        opened_at=now,
        updated_at=now,
    )
    _PRS[pr_id] = pr
    return pr