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
from app.schemas.gaps import Gap, RemediationDraft
from app.schemas.prs import PullRequest, PRsResponse
from app.schemas.repos import Repository, ReposResponse
from app.core.config import get_settings
from app.db.database import run_query

logger = logging.getLogger("niam.github")


def _check_mocks():
    if not get_settings().use_mocks:
        raise HTTPException(
            status_code=503,
            detail="Not yet implemented — see IMPLEMENTATION_ROADMAP.md Phase N",
        )


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


def _append_amendment(existing: str, draft, gap) -> str:
    """Splice a generated section into an existing legal document.

    Appended rather than inserted at a guessed position: without parsing
    the document's structure there is no way to know where a section
    belongs, and appending is the one operation that cannot corrupt what
    is already there. A human reviews the pull request and moves it.

    Idempotent on the marker, so regenerating a fix for the same gap
    replaces its previous block instead of stacking a second copy.
    """
    # diff_text carries the generated markdown; `document` is the section
    # TITLE the UI renders as a label (see ComplianceImpactPanel, which
    # shows draft.document, and PRReviewModal, which shows draft.diff_text
    # as the body). Committing `document` would have written a one-line
    # heading into the policy and called it an amendment.
    body = (draft.diff_text or draft.document or "").strip()
    if not body:
        return existing

    marker = f"<!-- niam:gap:{gap.id} -->"
    block = f"{marker}\n{body}\n<!-- /niam:gap:{gap.id} -->"

    start = existing.find(marker)
    if start != -1:
        end = existing.find(f"<!-- /niam:gap:{gap.id} -->", start)
        if end != -1:
            end += len(f"<!-- /niam:gap:{gap.id} -->")
            return existing[:start] + block + existing[end:]

    separator = "\n\n" if existing.strip() else ""
    return f"{existing.rstrip()}{separator}\n{block}\n"


# Pull requests live in the graph, not in this process.
#
# This was `_PRS: dict[str, PullRequest] = {}` -- an in-memory store, while
# mark_pr_opened() wrote `status = 'pr_opened'` onto the :Gap node in
# Neo4j. So a restart left every affected gap permanently claiming to be
# "with legal" while the pull request backing that claim had vanished from
# the review queue. A durable statement backed by volatile evidence is
# worse than either alone: the UI showed a state nothing could justify.

_MERGE_PR = """
MATCH (g:Gap {id: $gap_id})
MERGE (pr:PullRequest {id: $id})
ON CREATE SET pr.gap_id = $gap_id, pr.title = $title,
              pr.repo_full_name = $repo_full_name, pr.status = $status,
              pr.opened_by = $opened_by, pr.reviewer = $reviewer,
              pr.github_pr_url = $github_pr_url, pr.dry_run = $dry_run,
              pr.opened_at = $now, pr.updated_at = $now
ON MATCH SET  pr.title = $title, pr.status = $status,
              pr.github_pr_url = $github_pr_url, pr.dry_run = $dry_run,
              pr.updated_at = $now
MERGE (g)-[:HAS_PR]->(pr)
"""

_QUERY_PRS = """
MATCH (pr:PullRequest)
OPTIONAL MATCH (g:Gap)-[:HAS_PR]->(pr)
OPTIONAL MATCH (g)-[hd:HAS_DRAFT]->(rd:RemediationDraft)
OPTIONAL MATCH (g)-[:VIOLATES]->(c:DPDPClause)
RETURN pr, g.id AS gap_id,
       collect(DISTINCT c.clause_id) AS clause_ids,
       collect(DISTINCT {
           document: rd.document, summary: rd.summary,
           file_path: rd.file_path, diff_text: rd.diff_text, order: hd.order
       }) AS drafts
ORDER BY pr.opened_at DESC
"""


def _persist_pr(pr: PullRequest, dry_run: bool) -> None:
    """Best-effort. A pull request that exists on GitHub but fails to
    record here is still real, so this must not undo it -- the caller has
    already committed. It is logged loudly instead."""
    try:
        run_query(
            _MERGE_PR,
            {
                "id": pr.id,
                "gap_id": pr.gap_id,
                "title": pr.title,
                "repo_full_name": pr.repo_full_name,
                "status": str(pr.status),
                "opened_by": pr.opened_by,
                "reviewer": pr.reviewer,
                "github_pr_url": pr.github_pr_url or "",
                "dry_run": dry_run,
                "now": _NOW().isoformat(),
            },
        )
    except RuntimeError as exc:
        logger.error(
            "Opened PR %s but could not record it in the graph: %s",
            pr.id,
            exc,
        )


# Enough to fill a picker without paging the whole account.
MAX_REPOS = 100


def list_repositories() -> ReposResponse:
    """Repositories this instance's GITHUB_TOKEN can actually see.

    Previously this returned four invented `nova-labs/*` repositories with
    invented compliance scores -- and since those repos do not exist,
    clicking scan on any of them produced a GitHub 404. It was later
    changed to return an empty list, which was honest but left the page
    with nothing to offer.

    Listing the token's real repositories is both honest and useful: it is
    where the picker gets its contents, so a scan target is chosen rather
    than typed from memory. No compliance fields are set, because nothing
    here has been scanned yet and a score would be fiction.
    """
    settings = get_settings()
    if not settings.github_token:
        # Not an error. The scan panel still accepts a typed owner/repo.
        return ReposResponse(repositories=[])

    try:
        auth = Auth.Token(settings.github_token)
        g = Github(auth=auth)
        repos, truncated = [], False
        for i, repo in enumerate(g.get_user().get_repos(sort="pushed")):
            if i >= MAX_REPOS:
                truncated = True
                break
            repos.append(
                Repository(
                    id=str(repo.id),
                    full_name=repo.full_name,
                    branch=repo.default_branch or "main",
                    private=repo.private,
                    pushed_at=(
                        repo.pushed_at.isoformat() if repo.pushed_at else None
                    ),
                )
            )
        return ReposResponse(repositories=repos, truncated=truncated)
    except GithubException as exc:
        msg = (
            exc.data.get("message", str(exc))
            if getattr(exc, "data", None)
            else str(exc)
        )
        logger.warning("Could not list repositories: %s", msg)
        # Degrade to empty rather than failing the page -- the typed
        # owner/repo input is unaffected by this call.
        return ReposResponse(repositories=[])


def list_pull_requests() -> PRsResponse:
    # No _check_mocks() here: these are REAL pull requests. Gating this on
    # USE_MOCKS meant that with mocks off -- the default -- you could open
    # a real PR and then get a 503 trying to list it.
    try:
        rows = run_query(_QUERY_PRS)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    prs = []
    for row in rows:
        node = row["pr"]
        drafts = [
            RemediationDraft(
                document=d.get("document") or "",
                summary=d.get("summary") or "",
                file_path=d.get("file_path"),
                diff_text=d.get("diff_text"),
            )
            for d in sorted(
                row.get("drafts") or [], key=lambda d: d.get("order") or 0
            )
            if d.get("document") or d.get("diff_text")
        ]
        prs.append(
            PullRequest(
                id=node["id"],
                gap_id=row.get("gap_id") or node.get("gap_id") or "",
                title=node.get("title") or "",
                repo_full_name=node.get("repo_full_name") or "",
                status=node.get("status") or PRStatus.READY_FOR_REVIEW,
                opened_by=node.get("opened_by") or "niam-bot",
                reviewer=node.get("reviewer") or "Legal Team",
                regulations=[c for c in (row.get("clause_ids") or []) if c],
                files=drafts,
                github_pr_url=node.get("github_pr_url") or None,
                opened_at=node.get("opened_at") or "",
                updated_at=node.get("updated_at") or "",
            )
        )
    return PRsResponse(pull_requests=prs)


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
        targets = [d.file_path for d in gap.remediation_drafts if d.file_path]
        if not targets:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Gap '{gap.id}' has no document to amend — its drafts "
                    "carry no file_path. Disclosure gaps get one from the "
                    "policy document they are linked to; run "
                    "legal/load_policies.py and reconcile again."
                ),
            )
        logger.warning(
            "DRY RUN: would create branch %r on %s and amend %d file(s): "
            "%s. Set GITHUB_DRY_RUN=false to perform it for real.",
            branch_name,
            repo_full_name,
            len(targets),
            targets,
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
        _persist_pr(pr, dry_run=True)
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

        # 3. Amend the document(s)
        #
        # The model writes only the new section; this code splices it into
        # the existing file. The previous version passed draft.document
        # straight to update_file() as the file's ENTIRE new contents,
        # which would have replaced a whole privacy policy with a single
        # generated fragment. Keeping the merge mechanical means an LLM
        # mistake costs one wrong paragraph, never the rest of the
        # document.
        amended = 0
        for draft in gap.remediation_drafts:
            if not draft.file_path:
                # A gap with no document to amend -- a not-yet-commenced
                # clause, say. Nothing to commit for it.
                continue

            try:
                file_contents = repo.get_contents(
                    draft.file_path, ref=branch_name
                )
                if isinstance(file_contents, list):
                    file_contents = file_contents[0]
                existing = file_contents.decoded_content.decode(
                    "utf-8", errors="replace"
                )
                repo.update_file(
                    path=draft.file_path,
                    message=(
                        f"Amend {draft.file_path} for compliance gap "
                        f"{gap.id}"
                    ),
                    content=_append_amendment(existing, draft, gap),
                    sha=file_contents.sha,
                    branch=branch_name,
                )
                amended += 1
            except GithubException as e:
                if getattr(e, "status", None) == 404:
                    repo.create_file(
                        path=draft.file_path,
                        message=(
                            f"Create {draft.file_path} for compliance gap "
                            f"{gap.id}"
                        ),
                        content=_append_amendment("", draft, gap),
                        branch=branch_name,
                    )
                    amended += 1
                else:
                    raise

        if not amended:
            # Refuse rather than open an empty pull request. This is what
            # used to happen silently for every gap, because nothing set
            # file_path on a draft.
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Gap '{gap.id}' has no document to amend — its drafts "
                    "carry no file_path. Disclosure gaps get one from the "
                    "policy document they are linked to; run "
                    "legal/load_policies.py and reconcile again."
                ),
            )

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
        _persist_pr(pr, dry_run=False)
        return pr

    except GithubException as exc:
        msg = (
            exc.data.get("message", str(exc))
            if getattr(exc, "data", None)
            else str(exc)
        )
        raise HTTPException(status_code=503, detail=f"GitHub API Error: {msg}")
