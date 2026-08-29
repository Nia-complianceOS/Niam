"""
Tests for the reconciliation engine.
"""

from reconciliation.reconciler import classify_gap


def test_classify_gap_ungoverned_egress():
    # vendors present AND no clauses at all -> severity="high", kind="ungoverned_egress"
    vendors = ["Stripe"]
    clauses = []
    severity, kind = classify_gap(vendors, clauses)
    assert severity == "high"
    assert kind == "ungoverned_egress"


def test_classify_gap_future_obligation():
    # vendors present AND clauses exist but none in_force -> severity="medium", kind="future_obligation"
    vendors = ["Stripe"]
    clauses = [{"status": "not_yet_commenced"}]
    severity, kind = classify_gap(vendors, clauses)
    assert severity == "medium"
    assert kind == "future_obligation"


def test_classify_gap_ungoverned_collection():
    # no vendors AND no clauses at all -> severity="low", kind="ungoverned_collection"
    vendors = []
    clauses = []
    severity, kind = classify_gap(vendors, clauses)
    assert severity == "low"
    assert kind == "ungoverned_collection"


def test_classify_gap_no_gap_compliant():
    # vendors present AND in_force clause exists -> no gap
    vendors = ["Stripe"]
    clauses = [{"status": "in_force"}]
    severity, kind = classify_gap(vendors, clauses)
    assert severity is None
    assert kind is None


def test_classify_gap_no_gap_internal():
    # no vendors AND in_force clause exists -> no gap
    vendors = []
    clauses = [{"status": "in_force"}]
    severity, kind = classify_gap(vendors, clauses)
    assert severity is None
    assert kind is None


def test_classify_gap_no_gap_internal_future():
    # no vendors AND clauses exist but none in_force -> no gap
    vendors = []
    clauses = [{"status": "not_yet_commenced"}]
    severity, kind = classify_gap(vendors, clauses)
    assert severity is None
    assert kind is None
