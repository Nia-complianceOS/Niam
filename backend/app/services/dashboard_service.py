"""
Assembles the Dashboard page's stat cards, timeline, and commit feed.

Currently returns realistic mock data matching the DashboardSummaryResponse
contract, so Frontend can build against a real running endpoint. Swap the
body of get_dashboard_summary() for real Neo4j/GitHub calls once the
Data & Graph Intelligence module's graph is populated — the return shape
does not need to change.
"""

from datetime import datetime, timedelta, timezone

from app.schemas.common import CommitRef
from app.schemas.dashboard import CommitActivity, DashboardSummaryResponse, StatCard, TimelineStep

_NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


def get_dashboard_summary() -> DashboardSummaryResponse:
    now = _NOW()
    return DashboardSummaryResponse(
        stat_cards=[
            StatCard(label="Overall Compliance Score", value="73%", sub_label="↓ 4pts since last push", sub_tone="warn"),
            StatCard(label="Compliance Drift", value="3 Active", sub_label="Mixpanel, Segment, S3 bucket", sub_tone="warn"),
            StatCard(label="Open Pull Requests", value="2", sub_label="1 awaiting legal review", sub_tone="neutral"),
            StatCard(label="Connected Vendors", value="6", sub_label="DPDP, GDPR, SOC2", sub_tone="neutral"),
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