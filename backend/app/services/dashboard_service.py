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
from app.schemas.dashboard import CommitActivity, DashboardSummaryResponse, StatCard, TimelineStep

logger = logging.getLogger("continuum.dashboard_service")

_NOW = lambda: datetime.now(timezone.utc)  # noqa: E731

_QUERY_VENDOR_COUNT = "MATCH (v:Vendor) RETURN count(v) AS vendor_count"


def _live_vendor_count() -> int | None:
    """
    Returns the real connected-vendor count from Neo4j, or None if the
    graph is unreachable. None (not an exception) is deliberate here —
    losing the vendor count shouldn't take down the whole dashboard
    response the way an unreachable graph does for the dedicated Graph
    page; the caller degrades this one stat card gracefully instead.
    """
    try:
        rows = run_query(_QUERY_VENDOR_COUNT)
        return rows[0]["vendor_count"] if rows else 0
    except RuntimeError as exc:
        logger.warning("Could not fetch live vendor count from Neo4j, falling back: %s", exc)
        return None


def get_dashboard_summary() -> DashboardSummaryResponse:
    now = _NOW()

    vendor_count = _live_vendor_count()
    if vendor_count is not None:
        vendor_card = StatCard(
            label="Connected Vendors", value=str(vendor_count),
            sub_label="Live from graph", sub_tone="neutral",
        )
    else:
        # Neo4j unreachable — degrade this one card rather than fail
        # the entire dashboard endpoint over a single stat.
        vendor_card = StatCard(
            label="Connected Vendors", value="—",
            sub_label="Graph unreachable", sub_tone="warn",
        )

    return DashboardSummaryResponse(
        stat_cards=[
            StatCard(label="Overall Compliance Score", value="73%", sub_label="↓ 4pts since last push", sub_tone="warn"),
            StatCard(label="Compliance Drift", value="3 Active", sub_label="Mixpanel, Segment, S3 bucket", sub_tone="warn"),
            StatCard(label="Open Pull Requests", value="2", sub_label="1 awaiting legal review", sub_tone="neutral"),
            vendor_card,
        ],
        timeline=[
            TimelineStep(title="Developer pushed commit", meta="a3f92c1 · main · 2 hours ago", state="done"),
            TimelineStep(title="Mixpanel added", meta="New analytics dependency detected in package.json", state="done"),
            TimelineStep(title="Compliance drift detected", state="done", tag="3 documents affected", tag_tone="warn"),
            TimelineStep(title="Privacy Policy outdated", meta="Missing disclosure for new data collection", state="active"),
            TimelineStep(title="AI generated update", state="pending"),
            TimelineStep(title="Pull request opened", state="pending"),
            TimelineStep(title="Waiting for legal review", state="pending", tag="Not started", tag_tone="wait"),
        ],
        recent_commits=[
            CommitActivity(
                commit=CommitRef(sha="a3f92c1", message="feat: add Mixpanel analytics", author="dev1",
                                  repo="nova-labs/checkout-service", committed_at=now - timedelta(hours=2)),
                has_compliance_impact=True, diff_stat="+142 -8",
            ),
            CommitActivity(
                commit=CommitRef(sha="e11bd4a", message="fix: correct checkout total rounding", author="dev2",
                                  repo="nova-labs/checkout-service", committed_at=now - timedelta(hours=5)),
                has_compliance_impact=False, diff_stat="+9 -4",
            ),
            CommitActivity(
                commit=CommitRef(sha="71adf3c", message="feat: add Google OAuth login", author="dev1",
                                  repo="nova-labs/checkout-service", committed_at=now - timedelta(days=2)),
                has_compliance_impact=True, diff_stat="+88 -0",
            ),
        ],
        synced_at=now,
    )
