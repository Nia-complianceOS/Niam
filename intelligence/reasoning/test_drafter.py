"""
test_drafter.py - Unit tests for the remediation drafter.

draft_and_write_for_gap() takes an owner_id first now
(smoke/TENANCY_CONTRACT.md). Gap ids are owner-prefixed, but an id is a
guessable string, so both the read and the write also filter on owner_id
-- these tests check the owner actually reaches both queries.
"""

import json
import pytest
from unittest.mock import Mock, patch
from reasoning.drafter import RemediationDrafter

OWNER = "owner-1"
GAP_ID = "gap-owner-1-niam-demo-system-email-Mailgun"


@patch("reasoning.drafter.verify_remediation")
def test_drafter_prompt_and_parsing(mock_verify):
    mock_verify.return_value = {
        "verified": True,
        "reasons": [],
        "classification": "violation",
    }
    mock_neo4j = Mock()
    mock_neo4j.run_read.return_value = [
        {
            "gap_id": GAP_ID,
            "data_types": ["Email"],
            "vendor": "Mailgun",
            "clauses": [
                {
                    "clause_id": "c1",
                    "title": "Consent",
                    "obligation_summary": "Must have consent",
                }
            ],
        }
    ]

    mock_client = Mock()
    mock_response = Mock()
    mock_response.text = json.dumps(
        {
            "section_title": "Updates for Mailgun",
            "amendment_markdown": "Added Mailgun to vendors.",
            "dpdp_citation": "c1",
            "confidence_score": 0.99,
            "rationale": "Because.",
        }
    )
    mock_client.models.generate_content.return_value = mock_response

    drafter = RemediationDrafter(api_key="fake", neo4j_client=mock_neo4j)
    drafter.client = mock_client

    drafter.draft_and_write_for_gap(OWNER, GAP_ID)

    # Verify Neo4j read -- and that it was scoped to this owner
    mock_neo4j.run_read.assert_called_once()
    read_args, _ = mock_neo4j.run_read.call_args
    assert read_args[1] == {"gap_id": GAP_ID, "owner_id": OWNER}

    # Verify Gemini call
    mock_client.models.generate_content.assert_called_once()
    args, kwargs = mock_client.models.generate_content.call_args
    assert "Mailgun" in kwargs["contents"]
    assert "Consent" in kwargs["contents"]

    # Verify Neo4j write
    mock_neo4j.run_write.assert_called_once()
    write_args, write_kwargs = mock_neo4j.run_write.call_args
    params = write_args[1]

    assert params["gap_id"] == GAP_ID
    # The write filters on owner too: matching a gap by id alone is an
    # authorization check that does not exist.
    assert params["owner_id"] == OWNER
    assert params["section_title"] == "Updates for Mailgun"
    assert params["amendment_markdown"] == "Added Mailgun to vendors."
    assert params["dpdp_citation"] == "c1"
    assert params["rationale"] == "Because."


def test_drafter_refuses_an_unowned_gap():
    """No owner, no draft -- and nothing read from the graph. An unowned
    MATCH on a gap id is a lookup anybody could perform."""
    mock_neo4j = Mock()
    # An explicit model, so constructing the drafter does not try to
    # resolve one over the network -- this test never gets that far.
    drafter = RemediationDrafter(
        api_key="fake", model="gemini-2.0-flash", neo4j_client=mock_neo4j
    )

    with pytest.raises(ValueError):
        drafter.draft_and_write_for_gap("", GAP_ID)

    mock_neo4j.run_read.assert_not_called()
    mock_neo4j.run_write.assert_not_called()
