"""
What a brand-new account sees.

A fresh signup has no :System, no :DataType, no :Vendor and no :Gap. It
is the state every user passes through, and it is where fabricating a
number is most tempting and least detectable -- because arithmetic over
an empty graph produces confident-looking answers:

    100 * (1 - 0 ungoverned / 0 total)  -> "100% compliant"
    0 covered of 0 data types           -> "0% compliant"

Both are reachable, both look like measurements, and both are claims
about a repository this system has never read. So the rule is that an
empty account gets zeros where something was genuinely counted, empty
lists where nothing was found, and None -- never a number -- for the
compliance score, with a sentence saying why.

These tests fake the graph rather than mocking a database: run_query is
replaced with a stub that answers each query the way Neo4j answers it
against an empty-but-healthy instance. That distinction is the point.
An empty graph is not an unreachable one, and the two must not be
rendered the same way.
"""

import pytest

from app.core.config import get_settings
from app.services import dashboard_service, gap_service, graph_service

OWNER = "brand-new-user"

# What GRAPH_SUMMARY returns for an account with nothing. Not no rows:
# the query is built from COUNT {} subqueries with no grouping key, so it
# always yields exactly one row. The clause counts are non-zero because
# the DPDP Act is shared reference data that exists before any user does.
EMPTY_SUMMARY = {
    "systems": 0,
    "data_types": 0,
    "vendors": 0,
    "clauses": 44,
    "in_force_clauses": 2,
    "data_types_with_no_clause": 0,
}


class MockData:
    data = []
    count = 0

class MockBuilder:
    def select(self, *args, **kwargs): return self
    def eq(self, *args, **kwargs): return self
    def order(self, *args, **kwargs): return self
    def limit(self, *args, **kwargs): return self
    def execute(self): return MockData()

class MockTable:
    def select(self, *args, **kwargs): return MockBuilder()

class MockClient:
    def table(self, name): return MockTable()

def _empty_supabase():
    return MockClient()


def _empty_graph(query, params=None):
    """Neo4j's answers for an empty account, keyed off the query text.

    The assertion on the first line is half the value of this fixture:
    every query the services run under test must arrive carrying this
    account's owner_id. A query that reaches the database without one is
    the tenancy bug, and here it is a test failure rather than another
    account's data.

    The distinction the branches encode is the one that matters for
    empty state: a query that AGGREGATES (count, collect) returns one row
    of zeros over an empty graph, while a query that returns per-node
    rows returns none. Getting that backwards is how "no rows" gets
    mistaken for "database down".
    """
    assert params and params.get("owner_id") == OWNER, (
        "query ran without this account's owner_id: " + query[:120]
    )
    if "data_types_with_no_clause" in query:
        return [dict(EMPTY_SUMMARY)]              # GRAPH_SUMMARY
    if "AS missing_requirements" in query:
        return [{"missing_requirements": []}]     # _QUERY_DPDP_GAPS
    if "AS systems" in query:
        return [{"systems": []}]                  # _QUERY_SYSTEMS
    if "AS collected" in query:
        return [{"collected": 0}]                 # _QUERY_COLLECTED_COUNT
    if "AS draft_count" in query:
        return [{"draft_count": 0}]               # _QUERY_HAS_DRAFTS
    if "AS covered" in query:
        return []                                 # _QUERY_COVERAGE: per-node
    if "AS in_force" in query and "AS total" in query:
        return [{"total": 0, "in_force": 0}]      # _QUERY_GENERAL_COVERAGE
    if "AS in_force" in query:
        return [{"in_force": 0}]                  # _QUERY_GENERAL_IN_FORCE
    if "AS total" in query:
        return [{"total": 0}]                     # _QUERY_NODE_COUNT
    return []


@pytest.fixture
def empty_graph(monkeypatch):
    for module in (dashboard_service, gap_service, graph_service):
        monkeypatch.setattr(module, "run_query", _empty_graph)
    if hasattr(gap_service, "get_supabase"):
        monkeypatch.setattr(gap_service, "get_supabase", _empty_supabase)


def test_dashboard_score_is_not_a_number(empty_graph):
    """The score card must read "—", not 0% and not 100%."""
    cards = dashboard_service.get_dashboard_summary(OWNER).stat_cards
    score_card = cards[0]

    assert score_card.label == "Overall Compliance Score"
    assert score_card.value == "—"
    assert score_card.value not in ("0%", "100%")
    assert "No repository scanned yet" in score_card.sub_label


def test_dashboard_counts_are_honest_zeros(empty_graph):
    """Everything that WAS counted reports its real count of zero.

    "—" is for what could not be measured. A vendor count of zero was
    measured, and dashing it out would be its own small dishonesty.
    """
    cards = {c.label: c for c in dashboard_service.get_dashboard_summary(OWNER).stat_cards}

    assert cards["Mapped Systems"].value == "0"
    assert cards["Coverage Gaps"].value == "0"
    assert cards["Vendors detected"].value == "0"
    # The Act exists before any user does, and its counts are shared.
    assert cards["In-Force Clauses"].value == "2"


def test_dashboard_commit_feed_is_empty_not_sampled(empty_graph):
    response = dashboard_service.get_dashboard_summary(OWNER)
    if not response.sample_panels:
        assert response.recent_commits == []


def test_gaps_response_is_empty_with_no_score(empty_graph):
    response = gap_service.list_gaps(OWNER)

    assert response.gaps == []
    assert response.open_gap_count == 0
    assert response.score is None
    assert response.score_delta is None
    assert "No repository scanned yet" in (response.score_explanation or "")


def test_compliance_graph_is_empty(empty_graph):
    response = graph_service.get_compliance_graph(OWNER)

    assert response.nodes == []
    assert response.edges == []
    assert response.total_nodes == 0
    # Nothing was cut, so nothing may claim to have been.
    assert response.truncated is False
    assert response.generated_at


def test_surface_pages_are_empty(empty_graph):
    assert gap_service.list_vendors(OWNER).vendors == []

    # The audit trail and the policy list fall back to illustrative rows
    # under USE_MOCKS, which is a separate (and labelled) mode. The claim
    # here is about the real path.
    if not get_settings().use_mocks:
        assert gap_service.list_audit_events(OWNER).events == []
        assert gap_service.list_policies(OWNER).policies == []


def test_regulations_score_label_is_a_dash(empty_graph):
    regs = {r.code: r for r in gap_service.list_regulations(OWNER).regulations}
    dpdp = regs["DPDP"]

    assert dpdp.score_label == "—"
    assert dpdp.missing_requirements == []
    assert dpdp.affected_systems == []
    # Still a real date: commencement is a fact about the Act, not about
    # this account, so it is known on day zero.
    assert dpdp.next_commencement_date
