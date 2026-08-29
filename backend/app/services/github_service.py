"""
GitHub-facing operations: repository listing and PR creation.

open_compliance_pr() is stubbed for now — it returns a mock PullRequest
instead of calling the real GitHub API via PyGithub. Phase C swaps the
body for the real create_git_ref/update_file/create_pull sequence from
the onboarding doc, using GITHUB_TOKEN from app/core/config.py.
"""

from github import Github, GithubException, Auth
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.common import ComplianceStatus, PRStatus
from app.schemas.gaps import Gap
from app.schemas.prs import PullRequest, PRsResponse
from app.schemas.repos import Repository, ReposResponse
from app.core.config import get_settings


def _check_mocks():
    if not get_settings().use_mocks:
        raise HTTPException(
            status_code=503,
            detail="Not yet implemented — see IMPLEMENTATION_ROADMAP.md Phase N",
        )


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


_PRS: dict[str, PullRequest] = {}


def list_repositories() -> ReposResponse:
    _check_mocks()
    now = _NOW()
    return ReposResponse(
        repositories=[
            Repository(
                id="r1",
                full_name="nova-labs/checkout-service",
                branch="main",
                score=73,
                last_scanned_at=(now - timedelta(minutes=4)).isoformat(),
                status=ComplianceStatus.WARNING,
                status_detail="Drift Detected",
            ),
            Repository(
                id="r2",
                full_name="nova-labs/auth-service",
                branch="main",
                score=91,
                last_scanned_at=(now - timedelta(hours=1)).isoformat(),
                status=ComplianceStatus.COMPLIANT,
                status_detail="Healthy",
            ),
            Repository(
                id="r3",
                full_name="nova-labs/marketing-site",
                branch="main",
                score=88,
                last_scanned_at=(now - timedelta(hours=3)).isoformat(),
                status=ComplianceStatus.COMPLIANT,
                status_detail="Healthy",
            ),
            Repository(
                id="r4",
                full_name="nova-labs/support-ai",
                branch="develop",
                score=64,
                last_scanned_at=(now - timedelta(hours=6)).isoformat(),
                status=ComplianceStatus.WARNING,
                status_detail="Retention Gap",
            ),
        ]
    )


def list_pull_requests() -> PRsResponse:
    _check_mocks()
    return PRsResponse(pull_requests=list(_PRS.values()))


def open_compliance_pr(gap: Gap) -> PullRequest:
    """
    Creates a real branch, updates files per remediation drafts,
    and opens a pull request against the source repository using PyGithub.
    """
    if not gap.remediation_drafts:
        raise HTTPException(
            status_code=400,
            detail=f"Gap '{gap.id}' has no remediation drafts yet — call generate-fix before open-pr",
        )

    settings = get_settings()
    if not settings.github_token:
        raise HTTPException(
            status_code=503, detail="GITHUB_TOKEN not configured"
        )

    repo_full_name = (
        gap.source_commit.repo
        if gap.source_commit
        else "nova-labs/checkout-service"
    )
    branch_name = f"nia/remediation/{gap.id}"

    try:
        auth = Auth.Token(settings.github_token)
        g = Github(auth=auth)
        repo = g.get_repo(repo_full_name)

        # 1. Get base branch SHA
        base_ref = repo.get_git_ref("heads/main")

        # 2. Create branch
        try:
            repo.get_git_ref(f"heads/{branch_name}")
        except GithubException:
            repo.create_git_ref(
                f"refs/heads/{branch_name}", base_ref.object.sha
            )

        # 3. Update files
        for draft in gap.remediation_drafts:
            if not draft.file_path:
                continue

            try:
                file_contents = repo.get_contents(
                    draft.file_path, ref=branch_name
                )
                # get_contents can return a list if it's a dir, but we assume file_path points to a file
                if isinstance(file_contents, list):
                    file_contents = file_contents[0]

                repo.update_file(
                    path=draft.file_path,
                    message=f"Update {draft.file_path} for compliance gap {gap.id}",
                    content=draft.document,
                    sha=file_contents.sha,
                    branch=branch_name,
                )
            except GithubException as e:
                if getattr(e, "status", None) == 404:
                    repo.create_file(
                        path=draft.file_path,
                        message=f"Create {draft.file_path} for compliance gap {gap.id}",
                        content=draft.document,
                        branch=branch_name,
                    )
                else:
                    raise

        # 4. Create PR
        pr_title = f"Compliance Update: {gap.vendor or gap.title}"
        pr_body = f"Resolves compliance gap: {gap.title}\n\n"
        for draft in gap.remediation_drafts:
            pr_body += f"- {draft.summary}\n"

        pull = repo.create_pull(
            title=pr_title, body=pr_body, head=branch_name, base="main"
        )

        pr_id = f"pr-{pull.number}"
        now = _NOW()
        pr = PullRequest(
            id=pr_id,
            gap_id=gap.id,
            title=pr_title,
            repo_full_name=repo_full_name,
            status=PRStatus.READY_FOR_REVIEW,
            opened_by="continuum-bot",
            reviewer="Legal Team",
            regulations=gap.regulations,
            files=gap.remediation_drafts,
            github_pr_url=pull.html_url,
            opened_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
        _PRS[pr_id] = pr
        return pr

    except GithubException as exc:
        msg = (
            exc.data.get("message", str(exc))
            if getattr(exc, "data", None)
            else str(exc)
        )
        raise HTTPException(status_code=503, detail=f"GitHub API Error: {msg}")
