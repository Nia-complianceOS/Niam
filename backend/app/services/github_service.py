"""
GitHub-facing operations: repository listing and PR creation.

open_compliance_pr() is REAL -- it creates a branch, commits files and
opens a pull request using GITHUB_TOKEN. (The old docstring here claimed
it was a stub long after it stopped being one.) Because it writes to a
real account with a real credential, it is guarded three ways:

  1. GITHUB_DRY_RUN (default true) -- logs exactly what it would do and
     creates nothing. Turn it off deliberately, not by default.
  2. PR_ALLOWED_REPOS -- explicit owner/repo allow-list. Empty means no
     repo may be written to. Fail-closed on purpose.
  3. The target repo comes ONLY from gap.source_commit.repo. There is no
     fallback. The previous code defaulted to a hardcoded demo repo when
     a gap had no commit -- and the reconciler never sets source_commit,
     so EVERY real gap took that path and aimed at somebody else's repo.
"""

import logging

from github import Github, GithubException, Auth
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.common import ComplianceStatus, PRStatus
from app.schemas.gaps import Gap
from app.schemas.prs import PullRequest, PRsResponse
from app.schemas.repos import Repository, ReposResponse
from app.core.config import get_settings

logger = logging.getLogger("niam.github")


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
    # No repository store exists yet, so the honest answer is an empty
    # list -- not a 503, and certainly not four invented nova-labs repos
    # that cannot be scanned because they do not exist. The Repositories
    # page takes a repo name directly (see C4), so an empty list does not
    # block scanning.
    if not get_settings().use_mocks:
        return ReposResponse(repositories=[])
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
    # No _check_mocks() here: _PRS holds REAL pull requests opened through
    # open_compliance_pr(). Gating this on USE_MOCKS meant that with mocks
    # off -- the default -- you could open a real PR and then get a 503
    # trying to list it. The gate was on the wrong side of the function.
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

    # No fallback. A gap with no source commit has no repository to target,
    # and guessing one means writing to a repo the user never nominated.
    if not gap.source_commit or not gap.source_commit.repo:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Gap '{gap.id}' has no source repository — nothing to open a "
                "PR against. Gaps get source_commit from the reconciler; if "
                "this is unexpected, the gap predates that being written."
            ),
        )

    repo_full_name = gap.source_commit.repo

    allowed = settings.pr_allowed_repos_list
    if not allowed:
        raise HTTPException(
            status_code=503,
            detail=(
                "PR_ALLOWED_REPOS is not configured. Opening pull requests is "
                "disabled until you list the repositories this instance may "
                "write to."
            ),
        )
    if repo_full_name not in allowed:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Refusing to open a PR against '{repo_full_name}' — not in "
                "PR_ALLOWED_REPOS."
            ),
        )

    branch_name = f"niam/remediation/{gap.id}"

    if settings.github_dry_run:
        logger.warning(
            "DRY RUN: would create branch %r on %s and commit %d file(s): %s. "
            "Set GITHUB_DRY_RUN=false to perform it for real.",
            branch_name,
            repo_full_name,
            len(gap.remediation_drafts),
            [d.file_path for d in gap.remediation_drafts if d.file_path],
        )
        now = _NOW()
        pr = PullRequest(
            id=f"pr-dryrun-{gap.id}",
            gap_id=gap.id,
            title=f"[DRY RUN] Compliance Update: {gap.vendor or gap.title}",
            repo_full_name=repo_full_name,
            status=PRStatus.READY_FOR_REVIEW,
            opened_by="niam-bot (dry run)",
            reviewer="Legal Team",
            regulations=gap.regulations,
            files=gap.remediation_drafts,
            github_pr_url="",
            opened_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
        _PRS[pr.id] = pr
        return pr

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
            opened_by="niam-bot",
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
