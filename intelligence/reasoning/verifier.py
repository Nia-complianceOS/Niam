"""
reasoning/verifier.py - Meta-verifier for generated remediation drafts.
"""

from retrieval.dpdp_retrieval import DPDPRetriever


def verify_remediation(draft: dict, retriever: DPDPRetriever) -> dict:
    """Returns {"verified": bool, "reasons": [...]}."""
    reasons = []
    clause = retriever.clause_detail(
        draft.get("dpdp_citation_clause_id")
    )  # check 1
    if clause is None:
        reasons.append("cited clause_id does not exist in the graph")
    elif draft.get("data_type") not in (
        clause.get("data_types_governed") or []
    ):
        reasons.append(
            "no GOVERNED_BY edge between this data type and the cited clause"
        )  # check 2
    elif clause.get("status") != "in_force":
        reasons.append(
            # check 3
            f"clause status is '{clause.get('status')}', not in_force"
        )
    return {"verified": len(reasons) == 0, "reasons": reasons}
