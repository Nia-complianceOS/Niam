"""
Assembles the Dashboard page's stat cards, timeline, and commit feed.

Partially wired to real Neo4j data: "Connected Vendors" now reflects
the actual count of :Vendor nodes written by the Data & Graph
Intelligence module's graph_writer.py. Everything else on this page
(compliance score, drift count, open PR count, the reconciliation
timeline, recent commit feed) stays mock data on purpose — none of it
has a real backing data source in Neo4j yet:

  - Score/drift/open-gap-count need Gap or DPDPClause reconciliation
    nodes, which app/intelligence/ doesn't populate yet (see
    graph_service.py's module docstring for the same caveat).
  - PR count needs real PyGithub wiring in github_service.py (still a
    stub as of Phase 2).
  - The timeline and commit feed need real GitHub webhook/commit
    history storage, which doesn't exist yet either.

Swap each of those in as their real data sources land — the response
shape (DashboardSummaryResponse) doesn't need to change when that
happens, only the function bodies below.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.db.database import run_query
from app.schemas.common import CommitRef
from app.schemas.dashboard import (
    CommitActivity,
    DashboardSummaryResponse,
    StatCard,
    TimelineStep,
)

logger = logging.getLogger("continuum.dashboard_service")


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


_QUERY_GRAPH_SUMMARY = """
MATCH (s:System) WITH count(s) AS systems
MATCH (d:DataType) WITH systems, count(d) AS data_types
MATCH (v:Vendor) WITH systems, data_types, count(v) AS vendors
MATCH (c:DPDPClause) WITH systems, data_types, vendors, count(c) AS clauses
OPTIONAL MATCH (c2:DPDPClause) WHERE c2.status = 'in_force'
WITH systems, data_types, vendors, clauses, count(c2) AS in_force_clauses
OPTIONAL MATCH (d2:DataType) WHERE NOT (d2)-[:GOVERNED_BY]->(:DPDPClause)
RETURN systems, data_types, vendors, clauses, in_force_clauses,
       count(d2) AS data_types_with_no_clause
"""


def _live_graph_summary() -> dict | None:
    """
    Returns the real graph summary stats from Neo4j, or None if the
    graph is unreachable. None (not an exception) is deliberate here —
    losing the graph shouldn't take down the whole dashboard
    response; the caller degrades these stat cards gracefully instead.
    """
    try:
        rows = run_query(_QUERY_GRAPH_SUMMARY)
        return rows[0] if rows else None
    except RuntimeError as exc:
        logger.warning(
            "Could not fetch graph summary from Neo4j, falling back: %s", exc
        )
        return None


def get_dashboard_summary() -> DashboardSummaryResponse:
    now = _NOW()

    summary = _live_graph_summary()

    if summary is not None:
        ungoverned = summary["data_types_with_no_clause"]
        total = summary["data_types"]
        score = round(100 * (1 - ungoverned / max(total, 1)))

        score_card = StatCard(
            label="Overall Compliance Score",
            value=f"{score}%",
            sub_label="Live from graph",
            sub_tone="neutral",
            score_explanation=f"Calculated as 100 * (1 - {ungoverned} ungoverned / {max(total, 1)} total)",
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
        vendor_card = StatCard(
            label="Connected Vendors",
            value=str(summary["vendors"]),
            sub_label="Live from graph",
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
            label="Connected Vendors",
            value="—",
            sub_label="Graph unreachable",
            sub_tone="warn",
        )

    return DashboardSummaryResponse(
        stat_cards=[
            score_card,
            systems_card,
            clauses_card,
            gaps_card,
            vendor_card,
        ],
        timeline=[
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
        ],
        recent_commits=[
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
        ],
        synced_at=now,
    )
