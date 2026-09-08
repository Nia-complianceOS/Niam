"""
The dashboard's response contract.

This test used to assert `response.timeline` and `response.recent_commits`
were non-empty -- which passed only because both were hardcoded fiction
returned unconditionally (a developer pushing Mixpanel to
nova-labs/checkout-service). Phase C deleted that, so the old assertions
now demand exactly the behaviour we removed.

get_dashboard_summary() degrades rather than raising when Neo4j is
unreachable, so these run without a database -- and since the tenancy
pass it takes an owner_id, so they pass one.
"""

from app.services.dashboard_service import get_dashboard_summary

# Any string will do: without a database every query fails and the
# service degrades. The point is that the parameter is required.
OWNER = "test-owner"


def test_dashboard_summary_matches_schema() -> None:
    response = get_dashboard_summary(OWNER)

    # Five stat cards, always -- they render "—" when the graph cannot be
    # read rather than disappearing.
    assert len(response.stat_cards) == 5
    assert response.synced_at

    # Lists, not necessarily populated. Empty is the correct state for a
    # fresh instance and must not be treated as a failure.
    assert isinstance(response.timeline, list)
    assert isinstance(response.recent_commits, list)


def test_sample_panels_flag_is_honest() -> None:
    """sample_panels must be set whenever illustrative data is present.

    It is what tells the UI to label the panels. If samples could ever be
    returned without it, unlabelled fiction reaches the front page -- which
    is the exact failure this flag exists to prevent.
    """
    response = get_dashboard_summary(OWNER)

    if response.timeline:
        assert response.sample_panels, "timeline present but not flagged as sample"


def test_no_score_is_never_a_number() -> None:
    """An unreadable or empty graph must not report a compliance score.

    The old scoring guarded its divide with max(total, 1), so an empty
    graph reported 100% compliant -- confidently wrong about the one thing
    this product measures.
    """
    score_card = response_score_card()
    if score_card.sub_label in (
        "Graph unreachable",
        "No repository scanned yet",
    ):
        assert score_card.value == "—"


def response_score_card():
    return get_dashboard_summary(OWNER).stat_cards[0]
