"""
test_verifier.py - Unit tests for the remediation verifier.
"""

from unittest.mock import Mock
from reasoning.verifier import verify_remediation


def test_verify_remediation_success():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever)
    assert res["verified"] is True
    assert len(res["reasons"]) == 0
    retriever.clause_detail.assert_called_with("c1")


def test_verify_remediation_missing_clause():
    retriever = Mock()
    retriever.clause_detail.return_value = None

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever)
    assert res["verified"] is False
    assert "does not exist" in res["reasons"][0]


def test_verify_remediation_wrong_data_type():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "in_force",
        "data_types_governed": ["IP Address"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever)
    assert res["verified"] is False
    assert "no GOVERNED_BY edge" in res["reasons"][0]


def test_verify_remediation_not_in_force():
    retriever = Mock()
    retriever.clause_detail.return_value = {
        "status": "not_yet_commenced",
        "data_types_governed": ["Email"],
    }

    draft = {"dpdp_citation_clause_id": "c1", "data_type": "Email"}

    res = verify_remediation(draft, retriever)
    assert res["verified"] is False
    assert "not in_force" in res["reasons"][0]
