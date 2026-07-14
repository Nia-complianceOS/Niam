from app.services.dashboard_service import get_dashboard_summary


def test_dashboard_summary_matches_schema() -> None:
    response = get_dashboard_summary()

    assert response.stat_cards
    assert response.timeline
    assert response.recent_commits
    assert response.synced_at
