"""
reasoning/verifier.py - Meta-verifier for generated remediation drafts.

Three graph-grounded checks, each falsifiable with one Cypher query:
the cited clause exists, a GOVERNED_BY edge really connects the gap's
data type to it, and the clause's commencement status is known.

What changed, and why it matters: check 3 used to require
status == "in_force" and treat anything else as a verification FAILURE.
Under the DPDP Act's staggered commencement almost nothing is in force
today -- Tranche 3, which carries nearly every data-handling obligation,
commences 2027-05-13 -- so essentially every well-formed, correctly
cited draft came back verified: false, for the single reason that the
law it cites has not started yet. That is not a bad citation. It is a
future obligation, and reporting it as a failed verification both buries
real citation errors in noise and misrepresents the finding.

So commencement now sets a `classification` rather than a verdict:

    in_force          -> "violation"          (live obligation, today)
    not_yet_commenced -> "future_obligation"  (readiness, with a date)
    anything else     -> "unverified"         (we do not know; say so)

`verified` answers only the question the verifier can actually settle:
is this citation sound? A draft can be verified AND a future obligation,
which is the honest description of most of this graph right now.
"""

from retrieval.dpdp_retrieval import DPDPRetriever


def verify_remediation(draft: dict, retriever: DPDPRetriever) -> dict:
    """Returns {"verified": bool, "classification": str, "reasons": [...]}.

    `reasons` carries every remark, fatal or not, so a draft that fails
    two checks reports two -- the checks used to be chained with elif and
    only ever surfaced the first. `verified` is driven by the fatal ones
    alone.
    """
    failures: list[str] = []
    notes: list[str] = []

    # check 1 -- the cited clause exists at all
    clause = retriever.clause_detail(draft.get("dpdp_citation_clause_id"))
    if clause is None:
        # Checks 2 and 3 both read from `clause`, so this one alone is
        # genuinely fatal and short-circuits.
        return {
            "verified": False,
            "classification": "unverified",
            "reasons": ["cited clause_id does not exist in the graph"],
        }

    # check 2 -- a GOVERNED_BY edge really connects this data type to it
    if draft.get("data_type") not in (clause.get("data_types_governed") or []):
        failures.append(
            "no GOVERNED_BY edge between this data type and the cited clause"
        )

    # check 3 -- has the clause commenced? Classifies, does not condemn.
    status = clause.get("status")
    if status == "in_force":
        classification = "violation"
    elif status == "not_yet_commenced":
        classification = "future_obligation"
        effective = clause.get("effective_from")
        notes.append(
            "clause has not commenced yet"
            + (f" (effective {effective})" if effective else "")
            + " — future obligation, not a present violation"
        )
    else:
        # An unknown commencement status is not a citation error, but we
        # cannot claim the obligation is live either. Say we don't know.
        classification = "unverified"
        notes.append(
            f"clause commencement status is '{status}' — cannot tell "
            "whether this obligation is live"
        )

    return {
        "verified": not failures,
        "classification": classification,
        "reasons": failures + notes,
    }
