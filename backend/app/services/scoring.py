"""
The compliance score, in one place.

Previously this formula was written out three times (dashboard_service,
gap_service.list_gaps, gap_service.list_regulations), each guarding the
divide with `max(total, 1)`. That guard is why an EMPTY graph reported
"100% compliant": 100 * (1 - 0 ungoverned / max(0, 1)) == 100.

A tool that claims perfect compliance when it has no data is worse than
one that admits it doesn't know -- it is confidently wrong about the
exact thing it exists to measure. So an empty denominator now yields
None, and callers render that as "not applicable", never as a number.
"""


def compliance_score(
    ungoverned: int, total: int
) -> tuple[float | None, str]:
    """Returns (score, explanation).

    score is None when there is nothing to score -- no data types mapped
    yet. It is NOT 0 (which reads as "totally non-compliant") and NOT 100
    (which reads as "fully compliant"). Both would be assertions we have
    no evidence for.
    """
    if total <= 0:
        return None, (
            "No data types mapped yet — a score needs at least one "
            "collected data type to be meaningful."
        )

    score = float(round(100 * (1 - ungoverned / total)))
    return score, (
        f"Calculated as 100 × (1 − {ungoverned} ungoverned / {total} total)"
    )
