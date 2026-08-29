"""
test_drafter.py - Unit tests for the remediation drafter.
"""

import json
from unittest.mock import Mock, patch
from reasoning.drafter import RemediationDrafter


@patch("reasoning.drafter.verify_remediation")
def test_drafter_prompt_and_parsing(mock_verify):
    mock_verify.return_value = {"verified": True, "reasons": []}
    mock_neo4j = Mock()
    mock_neo4j.run_read.return_value = [
        {
            "gap_id": "gap-123",
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

    drafter.draft_and_write_for_gap("gap-123")

    # Verify Neo4j read
    mock_neo4j.run_read.assert_called_once()

    # Verify Gemini call
    mock_client.models.generate_content.assert_called_once()
    args, kwargs = mock_client.models.generate_content.call_args
    assert "Mailgun" in kwargs["contents"]
    assert "Consent" in kwargs["contents"]

    # Verify Neo4j write
    mock_neo4j.run_write.assert_called_once()
    write_args, write_kwargs = mock_neo4j.run_write.call_args
    params = write_args[1]

    assert params["gap_id"] == "gap-123"
    assert params["section_title"] == "Updates for Mailgun"
    assert params["amendment_markdown"] == "Added Mailgun to vendors."
    assert params["dpdp_citation"] == "c1"
    assert params["rationale"] == "Because."
