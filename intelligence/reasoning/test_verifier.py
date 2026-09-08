"""
test_verifier.py - Unit tests for the remediation verifier.

verify_remediation() takes an owner_id now (smoke/TENANCY_CONTRACT.md):
every check it makes is falsified against ONE account's subgraph, and
`data_types_governed` comes back scoped to that account.
"""

import pytest
from unittest.mock import Mock
from reasoning.verifier import verify_remediation

OWNER = "owner-1"


def test_verify_remediation_success():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is True
    assert len(res["reasons"]) == 0
    retriever.clause_detail.assert_called_with(OWNER, "c1")


def test_verify_remediation_missing_clause():
    retriever = Mock()
    retriever.clause_detail.return_value = None

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is False
    assert "does not exist" in res["reasons"][0]


def test_verify_remediation_wrong_data_type():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["IP Address"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is False
    assert "no GOVERNED_BY edge" in res["reasons"][0]


def test_verify_remediation_success_is_a_violation():
    """An in-force clause, correctly cited, is a live violation."""
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["classification"] == "violation"


def test_verify_remediation_not_in_force_is_a_future_obligation():
    """A sound citation to a clause that has not commenced is NOT a
    verification failure -- it is a future obligation. Under the DPDP
    Act's staggered commencement this is the common case, and treating
    it as a failure hid real citation errors in the noise."""
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "not_yet_commenced",
        "effective_from": "2027-05-13",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is True
    assert res["classification"] == "future_obligation"
    assert "future obligation" in res["reasons"][0]


def test_verify_remediation_unknown_commencement():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "unknown",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is True
    assert res["classification"] == "unverified"


def test_verify_remediation_bad_citation_still_fails():
    """The check that actually falsifies a draft still falsifies it, and
    a not-yet-commenced clause does not soften that."""
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "not_yet_commenced",
        "data_types_governed": ["IP Address"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever, OWNER)
    assert res["verified"] is False
    assert res["classification"] == "future_obligation"


def test_verify_remediation_requires_an_owner():
    """An unowned verification cannot falsify anything -- it would run
    against an empty subgraph and report every citation as unfounded, or
    against a merged one and report another account's data as proof."""
    retriever = Mock()
    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    with pytest.raises(ValueError):
        verify_remediation(draft, retriever, "")

    retriever.clause_detail.assert_not_called()


def test_verify_remediation_scopes_the_lookup_to_the_owner():
    """The owner has to reach the retriever, not just the signature."""
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}
    verify_remediation(draft, retriever, "owner-2")

    retriever.clause_detail.assert_called_with("owner-2", "c1")
