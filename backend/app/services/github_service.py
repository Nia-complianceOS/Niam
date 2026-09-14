"""
GitHub-facing operations: repository listing and PR creation.

EVERY FUNCTION HERE RUNS ON THE CALLING USER'S OWN GITHUB TOKEN. It used
to run on one GITHUB_TOKEN from the environment, shared by every account
on the instance, which meant GET /github/repos listed a stranger's
private repository names and a pull request opened from a gap was
authored by whoever owned that PAT. Tokens now come from
services/github_identity.get_token(owner_id) -- stored per user,
encrypted at rest -- so `owner_id` is the first argument of every public
function here, per smoke/TENANCY_CONTRACT.md.

When a user has no connection this raises HTTPException(409, "Connect
your GitHub account first"). 409 on purpose, and not any of the
alternatives that were considered:
  * not 500 -- nothing has failed; the app is in a state the user can
    resolve.
  * not 401/403 -- their Niam session is perfectly valid.
  * not an empty list -- "you have no repositories" and "we cannot see
    your repositories" look identical in a picker and lead somewhere
    different. The frontend renders 409 as a Connect button.

open_compliance_pr() is REAL -- it creates a branch, commits files and
opens a pull request, now as the user. (The old docstring here claimed
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

All three are unchanged. Per-user tokens narrow the blast radius of a
mistake here (a user can only write where their own token can) but they
do not replace an allow-list: the user is trusting this tool to write to
their repository, and "you connected an account, so we may push to any
of its 300 repos" is not what they agreed to.
"""

import logging

import requests
from github import Github, GithubException, Auth
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.common import PRStatus
from app.schemas.gaps import Gap, RemediationDraft
from app.schemas.prs import PullRequest, PRsResponse
from app.schemas.repos import Repository, ReposResponse
from app.core.config import get_settings
from app.db.database import run_query
from app.services import github_identity, audit_service

logger = logging.getLogger("niam.github")

# The one string the frontend switches on. Kept in one place so the
# 409 body cannot drift between the four routes that can raise it.
NOT_CONNECTED_DETAIL = "Connect your GitHub account first"


def _check_mocks():
    if not get_settings().use_mocks:
        raise HTTPException(
            status_code=503,
            detail="Not yet implemented — see IMPLEMENTATION_ROADMAP.md Phase N",
        )


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


def resolve_token(owner_id: str, allow_env_fallback: bool = False) -> str | None:
    """This user's GitHub token, or None.

    `allow_env_fallback` is off by default and NOTHING ON THE API PATH
    MAY TURN IT ON. Falling back to the instance's GITHUB_TOKEN for a
    user who has not connected would show them the repositories of
    whoever owns that PAT and open pull requests under that identity --
    the exact failure per-user tokens exist to remove, except now it
    happens silently and only to users with no connection.

    The parameter exists for headless callers with genuinely no user:
    the CLIs under intelligence/ and one-off scripts, where an explicit
    opt-in at the call site is a readable statement of "this runs as the
    instance, not as a person".
    """
    token = github_identity.get_token(owner_id) if owner_id else None
    if token:
        return token
    if allow_env_fallback:
        return get_settings().github_token or None
    return None


def get_user_token(owner_id: str) -> str:
    """This user's token, or 409. The entry point other services use.

    scan_service wants this: a scan reads the repository through the
    GitHub API, and it should read it as the user who asked, not as the
    instance -- otherwise a private repo the user can see is a 404 and a
    private repo they cannot see is scannable.
    """
    token = resolve_token(owner_id)
    if not token:
        raise HTTPException(status_code=409, detail=NOT_CONNECTED_DETAIL)
    return token


def _client(owner_id: str) -> Github:
    """A PyGithub client authenticated as `owner_id`. 409 if not connected."""
    return Github(auth=Auth.Token(get_user_token(owner_id)))


GITHUB_API = "https://api.github.com"

# How long to wait on github.com before giving up. A user is watching a
# spinner on the other end of this; an unbounded request would hang a
# worker thread until the client gave up first.
GITHUB_TIMEOUT = 10


def validate_token(token: str) -> dict:
    """Ask GitHub who a token belongs to, before it is stored.

    The one function in this module that takes no owner_id, deliberately:
    it runs BEFORE a connection exists, on a credential that has just
    arrived from the OAuth exchange or from the paste box, and its only
    job is to decide whether that credential is real and whose it is.
    Storing an unvalidated token means the failure surfaces later, on a
    scan, as an unexplained 401.

    Returns {"login", "avatar_url", "scopes"}. The scopes come from
    GitHub's X-OAuth-Scopes response header -- absent for a fine-grained
    PAT, which is why an empty list is not treated as an error here; the
    call that needs `repo` will say so itself.

    Raises HTTPException(400) if GitHub rejects it, carrying GitHub's own
    message and never the token.
    """
    try:
        resp = requests.get(
            f"{GITHUB_API}/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            timeout=GITHUB_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach GitHub: {exc.__class__.__name__}",
        )

    if resp.status_code != 200:
        # GitHub's message ("Bad credentials"), not ours, and not the
        # token -- this string is rendered in the UI and written to logs.
        try:
            message = resp.json().get("message", "rejected the token")
        except ValueError:
            message = "rejected the token"
        raise HTTPException(
            status_code=400, detail=f"GitHub {message}"
        )

    data = resp.json()
    raw_scopes = resp.headers.get("X-OAuth-Scopes", "")
    return {
        "login": data.get("login") or "",
        "avatar_url": data.get("avatar_url") or "",
        "scopes": [s.strip() for s in raw_scopes.split(",") if s.strip()],
    }


def _github_message(exc: GithubException) -> str:
    """GitHub's own error text, without anything of ours attached.

    Never interpolate a token into an error: this string reaches a 503
    body and the logs.
    """
    return (
        exc.data.get("message", str(exc))
        if getattr(exc, "data", None)
        else str(exc)
    )


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
#
# pr.owner_id IS LOAD-BEARING, not decoration. :PullRequest is an owned
# label (smoke/TENANCY_CONTRACT.md), and gap_service._QUERY_LIST_GAPS
# reaches it through `OPTIONAL MATCH (g)-[:HAS_PR]->(pr:PullRequest
# {owner_id: $owner_id})`. A node written without owner_id is invisible to
# that match, and _gap_from_graph_row() then downgrades the gap from
# 'pr_opened' to 'fix_generated' on the correct grounds that no
# :PullRequest backs the claim -- so the PR is opened on GitHub, the user
# is told nothing happened, and clicking again opens a second one. It is
# SET on both branches because rows written before this existed need the
# property added the next time they are touched. (Rows never touched again
# need a one-off backfill:
#   MATCH (g:Gap)-[:HAS_PR]->(pr:PullRequest) WHERE pr.owner_id IS NULL
#   SET pr.owner_id = g.owner_id )
#
# The :Gap is matched with its owner too, so a guessed gap id cannot hang
# a PullRequest node off somebody else's finding.
_MERGE_PR = """
MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
MERGE (pr:PullRequest {id: $id})
ON CREATE SET pr.gap_id = $gap_id, pr.title = $title,
              pr.repo_full_name = $repo_full_name, pr.status = $status,
              // The number is how GitHub is asked what happened to this
              // pull request afterwards. Left unstored, the refresh had
              // nothing to query with and silently skipped every row --
              // a merged amendment sat reading "awaiting review" forever.
              pr.number = $number,
              pr.opened_by = $opened_by, pr.reviewer = $reviewer,
              pr.github_pr_url = $github_pr_url, pr.dry_run = $dry_run,
              pr.opened_at = $now, pr.updated_at = $now
ON MATCH SET  pr.title = $title, pr.status = $status,
              pr.number = coalesce($number, pr.number),
              pr.github_pr_url = $github_pr_url, pr.dry_run = $dry_run,
              pr.updated_at = $now
SET pr.owner_id = $owner_id
MERGE (g)-[:HAS_PR]->(pr)
"""

# Owner filter on both owned labels in the pattern, including the :Gap
# reached by OPTIONAL MATCH from an already-filtered :PullRequest. That is
# redundant on a correct graph and it is what still holds if a later edit
# re-anchors the pattern. :RemediationDraft carries none (reached only
# through the filtered :Gap) and :DPDPClause carries none (shared law) --
# both per the contract.
_QUERY_PRS = """
MATCH (pr:PullRequest {owner_id: $owner_id})
OPTIONAL MATCH (g:Gap {owner_id: $owner_id})-[:HAS_PR]->(pr)
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


def _number_from_id(pr_id: str) -> int | None:
    """`pr-2` -> 2. None for a dry-run id, which has no GitHub number."""
    tail = (pr_id or "").rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else None


def _persist_pr(
    owner_id: str,
    pr: PullRequest,
    dry_run: bool,
    number: int | None = None,
) -> None:
    """Best-effort. A pull request that exists on GitHub but fails to
    record here is still real, so this must not undo it -- the caller has
    already committed. It is logged loudly instead."""
    try:
        run_query(
            _MERGE_PR,
            {
                "owner_id": owner_id,
                "id": pr.id,
                "gap_id": pr.gap_id,
                "title": pr.title,
                "repo_full_name": pr.repo_full_name,
                # Recovered from the id ("pr-2") when not passed, so pull
                # requests recorded before the number was stored still
                # become refreshable rather than needing to be recreated.
                "number": number if number is not None else _number_from_id(pr.id),
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


def list_repositories(owner_id: str, query: str | None = None) -> ReposResponse:
    """The repositories THIS USER's connected GitHub account can see.

    Previously this returned four invented `nova-labs/*` repositories with
    invented compliance scores -- and since those repos do not exist,
    clicking scan on any of them produced a GitHub 404. It was later
    changed to return an empty list, which was honest but left the page
    with nothing to offer. Then it listed the instance PAT's repositories,
    which was useful and wrong: it was somebody else's account.

    Listing the user's own repositories is honest and useful: it is where
    the picker gets its contents, so a scan target is chosen rather than
    typed from memory. No compliance fields are set, because nothing here
    has been scanned yet and a score would be fiction.

    No connection is a 409, not an empty list. An empty list here reads as
    "you have no repositories", which is a different problem with a
    different fix.
    """
    g = _client(owner_id)
    needle = (query or "").strip().lower()

    try:
        repos, truncated = [], False
        for repo in g.get_user().get_repos(sort="pushed"):
            if needle and needle not in repo.full_name.lower():
                continue
            if len(repos) >= MAX_REPOS:
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
        msg = _github_message(exc)
        logger.warning("Could not list repositories: %s", msg)
        if getattr(exc, "status", None) == 401:
            # The stored token was revoked at GitHub or has expired. That
            # is the same actionable state as never having connected, so
            # it gets the same answer rather than a 503 the user cannot
            # act on.
            raise HTTPException(status_code=409, detail=NOT_CONNECTED_DETAIL)
        # Degrade to empty rather than failing the page -- the typed
        # owner/repo input is unaffected by this call.
        return ReposResponse(repositories=[])


def list_pull_requests(owner_id: str) -> PRsResponse:
    # No _check_mocks() here: these are REAL pull requests. Gating this on
    # USE_MOCKS meant that with mocks off -- the default -- you could open
    # a real PR and then get a 503 trying to list it.
    #
    # No GitHub call either: this reads the :PullRequest nodes this account
    # owns, so it works (and stays scoped) whether or not GitHub is
    # reachable and whether or not the user is currently connected.
    try:
        # Ask GitHub what happened before reading our copy, so a merge
        # that closed a finding shows as closed rather than as still
        # waiting for a review that already happened.
        refresh_pull_request_states(owner_id)
        rows = run_query(_QUERY_PRS, {"owner_id": owner_id})
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


def open_compliance_pr(owner_id: str, gap: Gap) -> PullRequest:
    """
    Creates a real branch, updates files per remediation drafts, and opens
    a pull request against the source repository using PyGithub -- as the
    calling user, on their own token, so the PR is authored by them and
    the commit history on their repository names the right human.

    The caller must already have established that `gap` belongs to
    `owner_id` (gaps.py loads it via gap_service.get_gap(user_id, gap_id),
    which is that check).
    """
    if not gap.remediation_drafts:
        raise HTTPException(
            status_code=400,
            detail=f"Gap '{gap.id}' has no remediation drafts yet — call generate-fix before open-pr",
        )

    settings = get_settings()

    # Their token, never the instance's. A PR opened with GITHUB_TOKEN
    # would appear on the user's repository as somebody else's commit.
    token = get_user_token(owner_id)

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
        _persist_pr(owner_id, pr, dry_run=True)
        return pr

    try:
        auth = Auth.Token(token)
        g = Github(auth=auth)
        repo = g.get_repo(repo_full_name)

        # Whose name goes on the pull request. Read from the token so the
        # record matches the account that actually authored the commits,
        # rather than a stored login that could be stale.
        try:
            actor = g.get_user().login or "niam-bot"
        except GithubException:
            actor = "niam-bot"

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
            opened_by=actor,
            reviewer="Legal Team",
            regulations=gap.regulations,
            files=gap.remediation_drafts,
            github_pr_url=pull.html_url,
            opened_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
        _persist_pr(owner_id, pr, dry_run=False, number=pull.number)
        audit_service.log_event(
            owner_id,
            "pr_opened",
            "Pull request opened",
            f"Opened PR {pr.id} for gap {gap.id}",
            actor=actor,
            metadata={"pr_id": pr.id, "gap_id": gap.id, "repo": repo_full_name},
        )
        return pr

    except GithubException as exc:
        msg = _github_message(exc)
        if getattr(exc, "status", None) == 401:
            raise HTTPException(status_code=409, detail=NOT_CONNECTED_DETAIL)
        raise HTTPException(status_code=503, detail=f"GitHub API Error: {msg}")


# ---------------------------------------------------------------------------
# Keeping up with GitHub
# ---------------------------------------------------------------------------
#
# Everything above writes pull-request state at the moment Niam creates it.
# Nothing read it back, so merging a pull request on GitHub -- the entire
# point of the flow -- changed nothing here. The finding stayed "with
# legal" forever, and the one action a reviewer takes to close the loop was
# the one action the product could not see.
#
# GitHub is the source of truth for whether a pull request merged, so this
# asks it, rather than inferring from anything on this side.

_PRS_TO_REFRESH = """
MATCH (pr:PullRequest {owner_id: $owner_id})
WHERE coalesce(pr.dry_run, false) = false
  AND coalesce(pr.state, 'open') = 'open'
  AND (pr.checked_at IS NULL OR pr.checked_at < $stale_before)
RETURN pr.id AS id, pr.repo_full_name AS repo,
       coalesce(pr.number, toInteger(split(pr.id, '-')[-1])) AS number
LIMIT 25
"""

_UPDATE_PR_STATE = """
MATCH (pr:PullRequest {id: $id, owner_id: $owner_id})
SET pr.state = $state,
    pr.merged = $merged,
    pr.merged_at = $merged_at,
    pr.checked_at = $now,
    pr.updated_at = $now,
    // pr.status is what the review queue renders. Setting only the gap's
    // status left a merged pull request still listed as "ready for
    // review", which is the screen the reviewer is actually looking at.
    pr.status = CASE
        WHEN $merged THEN 'merged'
        WHEN $state = 'closed' THEN 'closed'
        ELSE pr.status END
WITH pr
OPTIONAL MATCH (g:Gap {owner_id: $owner_id})-[:HAS_PR]->(pr)
// A merged amendment IS the fix. Marking the gap resolved here is an
// assertion, and it is a safe one: the next reconcile re-tests the
// condition from the graph, and MERGE_GAP's ON MATCH resets a re-found
// gap to 'open'. So if the merge did not actually fix it, the claim is
// withdrawn automatically rather than standing forever.
//
// Closed-without-merging is the opposite: the reviewer rejected the
// wording. The finding stands, and its drafts are still there, so it
// goes back to fix_generated rather than to open.
SET g.status = CASE
        WHEN $merged THEN 'resolved'
        WHEN $state = 'closed' THEN 'fix_generated'
        ELSE g.status END,
    g.resolved_at = CASE WHEN $merged THEN $now ELSE g.resolved_at END,
    g.updated_at = $now
RETURN g.id AS gap_id
"""

# How long a checked state is trusted. Every gap and pull-request read
# would otherwise be a round trip to GitHub per open pull request, which
# is both slow and a good way to meet the API rate limit.
_PR_STATE_TTL = timedelta(seconds=60)


def refresh_pull_request_states(owner_id: str) -> int:
    """Ask GitHub what happened to this account's open pull requests.

    Never raises. This runs on the read path, and a listing that fails
    because GitHub was briefly unreachable is worse than a listing whose
    statuses are a minute stale.
    """
    now = datetime.now(timezone.utc)
    try:
        rows = run_query(
            _PRS_TO_REFRESH,
            {
                "owner_id": owner_id,
                "stale_before": (now - _PR_STATE_TTL).isoformat(),
            },
        )
    except RuntimeError:
        return 0
    if not rows:
        return 0

    try:
        token = github_identity.get_token(owner_id)
        if not token:
            return 0
        client = Github(auth=Auth.Token(token))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not open GitHub for PR refresh: %s", exc)
        return 0

    updated = 0
    for row in rows:
        if not row.get("repo") or not row.get("number"):
            continue
        try:
            pull = client.get_repo(row["repo"]).get_pull(int(row["number"]))
            merged = bool(pull.merged)
            state = "merged" if merged else pull.state
            run_query(
                _UPDATE_PR_STATE,
                {
                    "id": row["id"],
                    "owner_id": owner_id,
                    "state": state,
                    "merged": merged,
                    "merged_at": (
                        pull.merged_at.isoformat() if pull.merged_at else None
                    ),
                    "now": now.isoformat(),
                },
            )
            updated += 1
        except Exception as exc:  # noqa: BLE001
            # A deleted repository, a revoked token, a pull request the
            # user removed. None of these should break the page.
            logger.info(
                "Could not refresh pull request %s: %s", row["id"], exc
            )
    return updated
