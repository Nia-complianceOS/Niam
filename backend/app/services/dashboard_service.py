"""
Assembles the Dashboard page's stat cards, timeline, and commit feed.

All five stat cards are live from Neo4j.

The COMMIT FEED is now real too, and it is worth being precise about
what "real" means here. There is still no commit-history store and no
webhook event log. What there is, since the reconciler started writing
source_commit_* onto :Gap nodes, is a record of the exact commit each
gap was detected at -- so the feed is built by grouping gaps by their
source commit. Every row therefore describes a commit we actually read,
carrying a count of gaps that actually exist. Nothing is reconstructed
or estimated: a commit that produced no gap does not appear, which makes
this a compliance-impact feed rather than a git log, and the panel is
labelled accordingly.

The TIMELINE has no such source. A reconciliation timeline needs
per-stage event history that nothing records, so it stays empty unless
USE_MOCKS is on, and sample_panels then tells the UI to label it.

TENANCY (smoke/TENANCY_CONTRACT.md). get_dashboard_summary() takes
`owner_id` and every query below filters the owned labels on it. The
clause counts are the deliberate exception: :DPDPClause is the Act, one
shared corpus, so "12 of 44 sections in force" is the same true sentence
for every account.

A BRAND-NEW ACCOUNT is the case this file has to get right. It has no
:System, no :DataType and no :Gap, and the summary query answers with
zeros rather than no rows -- so `summary is not None` and the cards
render measured zeros. The score card is the one that must NOT: zero
ungoverned out of zero data types is not 100% compliant and not 0%
compliant, it is not a measurement at all, so it stays "—" and says why.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.db.database import run_query
from app.schemas.common import CommitRef
from app.services.scoring import compliance_score
from app.schemas.dashboard import (
    CommitActivity,
    DashboardSummaryResponse,
    StatCard,
    TimelineStep,
)

logger = logging.getLogger("niam.dashboard_service")


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


# Imported, not duplicated. This Cypher used to exist verbatim in two
# files that had to be kept in sync by hand; retrieval/queries.py is now
# the single definition. The alias keeps the old module-level name so
# gap_service.py's `from ...dashboard_service import _QUERY_GRAPH_SUMMARY`
# import keeps working.
from retrieval.queries import GRAPH_SUMMARY as _QUERY_GRAPH_SUMMARY


def score_from_summary(summary: dict) -> tuple[float | None, str]:
    """compliance_score(), plus the one distinction a fresh account needs.

    scoring.compliance_score() returns None for any empty denominator and
    explains it as "no data types mapped yet". That is true for a brand-
    new account and unhelpful: the reason nothing is mapped is that
    nothing has been scanned, and the next action is a scan, not a
    mapping exercise. Both branches return None. Neither ever returns a
    number for an account with no data -- the empty graph is exactly
    where the tempting fabrications are 100 ("nothing ungoverned!") and
    0 ("nothing covered!"), and both would be assertions about a
    repository we have never read.

    Shared with gap_service, which reports the same score on two other
    pages and must not word it differently.
    """
    if not summary.get("systems") and not summary.get("data_types"):
        return None, (
            "No repository scanned yet — nothing has been mapped, so "
            "there is nothing to score. Run a scan to start."
        )
    return compliance_score(
        summary["data_types_with_no_clause"], summary["data_types"]
    )


# One row per commit that produced at least one gap. gaps[0] is safe --
# every gap sharing a sha shares all six source_commit_* values, because
# they are copied from the same provenance entry.
_QUERY_RECENT_COMMITS = """
MATCH (g:Gap {owner_id: $owner_id}) WHERE g.source_commit_sha IS NOT NULL
WITH g.source_commit_sha AS sha, collect(g) AS gaps
WITH sha, gaps[0] AS g, size(gaps) AS gap_count
RETURN sha,
       coalesce(g.source_commit_message, '') AS message,
       coalesce(g.source_commit_author, 'unknown') AS author,
       coalesce(g.source_commit_repo, '') AS repo,
       coalesce(g.source_commit_branch, 'main') AS branch,
       coalesce(g.source_commit_committed_at, '') AS committed_at,
       gap_count
ORDER BY committed_at DESC, sha
LIMIT 8
"""


def _live_recent_commits(owner_id: str) -> list[CommitActivity]:
    """Commits that produced gaps, newest first, for one account.

    Returns an empty list -- not samples, not an exception -- when the
    graph has no gaps carrying a commit. That is the honest state for a
    fresh account, and for any graph scanned before the reconciler
    started recording provenance.

    The rows here carry commit messages, author names, repository names
    and SHAs out of a private repository. This is the sharpest
    disclosure edge on the dashboard, which is why the owner filter is
    in the pattern rather than applied to the results.
    """
    try:
        rows = run_query(_QUERY_RECENT_COMMITS, {"owner_id": owner_id})
    except RuntimeError as exc:
        logger.warning("Could not read recent commits from Neo4j: %s", exc)
        return []

    return [
        CommitActivity(
            commit=CommitRef(
                sha=row["sha"],
                message=row["message"],
                author=row["author"],
                repo=row["repo"],
                branch=row["branch"],
                committed_at=row["committed_at"],
            ),
            # Every commit in this feed is here BECAUSE it produced a gap.
            has_compliance_impact=True,
            gap_count=row["gap_count"],
        )
        for row in rows
    ]


def _live_graph_summary(owner_id: str) -> dict | None:
    """
    Returns this account's graph summary stats from Neo4j, or None if the
    graph is unreachable. None (not an exception) is deliberate here —
    losing the graph shouldn't take down the whole dashboard
    response; the caller degrades these stat cards gracefully instead.

    None means UNREACHABLE, never EMPTY. GRAPH_SUMMARY is built from
    COUNT {} subqueries with no grouping key, so an account with nothing
    in the graph still gets exactly one row, of zeros. Conflating the
    two would put "Graph unreachable" in front of every new user.
    """
    try:
        rows = run_query(_QUERY_GRAPH_SUMMARY, {"owner_id": owner_id})
        return rows[0] if rows else None
    except RuntimeError as exc:
        logger.warning(
            "Could not fetch graph summary from Neo4j, falling back: %s", exc
        )
        return None


# ---------------------------------------------------------------------------
# ILLUSTRATIVE SAMPLE DATA -- shown only when USE_MOCKS=true, and always
# flagged to the UI via sample_panels. Nothing here describes a real event.
# ---------------------------------------------------------------------------

_SAMPLE_TIMELINE = [
            TimelineStep(
                title="Developer pushed commit",
                meta="a3f92c1 · main · 2 hours ago",
                state="done",
            ),
            TimelineStep(
                title="Mixpanel added",
                meta="New analytics dependency detected in package.json",
                state="done",
            ),
            TimelineStep(
                title="Compliance drift detected",
                state="done",
                tag="3 documents affected",
                tag_tone="warn",
            ),
            TimelineStep(
                title="Privacy Policy outdated",
                meta="Missing disclosure for new data collection",
                state="active",
            ),
            TimelineStep(title="AI generated update", state="pending"),
            TimelineStep(title="Pull request opened", state="pending"),
            TimelineStep(
                title="Waiting for legal review",
                state="pending",
                tag="Not started",
                tag_tone="wait",
            ),
]


def _sample_commits(now):
    return [
            CommitActivity(
                commit=CommitRef(
                    sha="a3f92c1",
                    message="feat: add Mixpanel analytics",
                    author="dev1",
                    repo="nova-labs/checkout-service",
                    committed_at=now - timedelta(hours=2),
                ),
                has_compliance_impact=True,
                diff_stat="+142 -8",
            ),
            CommitActivity(
                commit=CommitRef(
                    sha="e11bd4a",
                    message="fix: correct checkout total rounding",
                    author="dev2",
                    repo="nova-labs/checkout-service",
                    committed_at=now - timedelta(hours=5),
                ),
                has_compliance_impact=False,
                diff_stat="+9 -4",
            ),
            CommitActivity(
                commit=CommitRef(
                    sha="71adf3c",
                    message="feat: add Google OAuth login",
                    author="dev1",
                    repo="nova-labs/checkout-service",
                    committed_at=now - timedelta(days=2),
                ),
                has_compliance_impact=True,
                diff_stat="+88 -0",
            ),
        ]


def get_dashboard_summary(owner_id: str) -> DashboardSummaryResponse:
    """The dashboard for ONE account.

    `owner_id` is required and comes from Depends(require_auth). Every
    stat below is this account's own except the clause counts, which are
    the Act.
    """
    now = _NOW()

    summary = _live_graph_summary(owner_id)

    if summary is not None:
        score, score_explanation = score_from_summary(summary)

        score_card = StatCard(
            label="Overall Compliance Score",
            # None means "nothing to score", not 0% and not 100%. A
            # brand-new account lands here, and "—" is the whole point:
            # the score_explanation carried alongside says why.
            value=f"{score:.0f}%" if score is not None else "—",
            sub_label=(
                "Live from graph" if score is not None
                else "No repository scanned yet"
            ),
            sub_tone="neutral",
            score_explanation=score_explanation,
        )
        systems_card = StatCard(
            label="Mapped Systems",
            value=str(summary["systems"]),
            sub_label=f"{summary['data_types']} data types mapped",
            sub_tone="neutral",
        )
        clauses_card = StatCard(
            label="In-Force Clauses",
            value=str(summary["in_force_clauses"]),
            sub_label=f"Out of {summary['clauses']} total",
            sub_tone="neutral",
        )
        gaps_card = StatCard(
            label="Coverage Gaps",
            value=str(summary["data_types_with_no_clause"]),
            sub_label="Ungoverned data types",
            sub_tone=(
                "warn"
                if summary["data_types_with_no_clause"] > 0
                else "neutral"
            ),
        )
        # NOT "Connected Vendors". These are :Vendor nodes, and the vast
        # majority are names the code scanner's LLM wrote down while
        # reading source -- Redis, AWS, a payment SDK it recognised. We
        # have an integration with almost none of them. Calling a count of
        # mentions "connected" was the single most misleading number on
        # this page.
        vendor_card = StatCard(
            label="Vendors detected",
            value=str(summary["vendors"]),
            sub_label="Found in scanned code",
            sub_tone="neutral",
        )
    else:
        # Neo4j unreachable — degrade these cards rather than fail
        # the entire dashboard endpoint over a single stat.
        score_card = StatCard(
            label="Overall Compliance Score",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )
        systems_card = StatCard(
            label="Mapped Systems",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )
        clauses_card = StatCard(
            label="In-Force Clauses",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )
        gaps_card = StatCard(
            label="Coverage Gaps",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )
        vendor_card = StatCard(
            label="Vendors detected",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )

    # The commit feed is real when the graph has gaps carrying a source
    # commit. The timeline still has no data source at all, so it stays
    # empty unless USE_MOCKS is on.
    use_mocks = get_settings().use_mocks
    recent_commits = _live_recent_commits(owner_id)

    # Real data always wins. Falling back to samples while real commits
    # exist would put invented rows on top of measured ones, and
    # sample_panels would then be lying about which is which.
    sample_commits = not recent_commits and use_mocks
    if sample_commits:
        recent_commits = _sample_commits(now)

    timeline = _SAMPLE_TIMELINE if use_mocks else []
    use_samples = bool(timeline) or sample_commits

    return DashboardSummaryResponse(
        stat_cards=[
            score_card,
            systems_card,
            clauses_card,
            gaps_card,
            vendor_card,
        ],
        timeline=timeline,
        recent_commits=recent_commits,
        sample_panels=use_samples,
        synced_at=now,
    )
