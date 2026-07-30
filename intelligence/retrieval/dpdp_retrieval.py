"""
retrieval/dpdp_retrieval.py — thin retrieval layer over the Living
Compliance Graph. All methods are read-only (Neo4jClient.run_read).

This is the module the DPDP Reasoner stage (not yet built) will consume
next: clauses_for_system() is the direct input builder described in the
onboarding doc's Section 02 — "give it the data node plus the retrieved
clauses."
"""

import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

from graph.neo4j_client import Neo4jClient
from graph.schema import DEFAULT_SYSTEM_NAME, validate_data_type
from retrieval.queries import (
    CLAUSES_FOR_DATA_TYPE,
    CLAUSES_FOR_SYSTEM,
    CLAUSE_DETAIL,
    COVERAGE_GAPS_FOR_SYSTEM,
    GRAPH_SUMMARY,
    UPCOMING_CLAUSES,
    VENDOR_EXPOSURE_FOR_CLAUSE,
)

logger = logging.getLogger(__name__)


class DPDPRetriever:
    def __init__(self, client: Neo4jClient = None):
        self.client = client or Neo4jClient()

    def close(self):
        self.client.close()

    # --- core lookups -----------------------------------------------------

    def clauses_for_data_type(self, data_type: str, include_upcoming: bool = True) -> List[dict]:
        """
        All DPDP clauses governing a single data type.

        Raises ValueError for a data_type outside DATA_TYPE_TAXONOMY —
        same fail-closed principle as the rest of the pipeline. A typo'd
        data_type silently returning an empty list would look identical
        to "genuinely no obligations apply", which is a dangerous
        ambiguity for a compliance tool to leave unresolved.
        """
        data_type = data_type.strip().lower()
        if not validate_data_type(data_type):
            raise ValueError(
                f"{data_type!r} is not in DATA_TYPE_TAXONOMY — check for a typo, "
                f"or schema.py/classifier.py's taxonomy may be out of sync."
            )
        rows = self.client.run_read(
            CLAUSES_FOR_DATA_TYPE,
            {"data_type": data_type, "include_upcoming": include_upcoming},
        )
        return rows

    def clauses_for_system(
        self, system_name: str = DEFAULT_SYSTEM_NAME, include_upcoming: bool = True
    ) -> Dict[str, List[dict]]:
        """
        Every DataType the given System collects, each mapped to its
        list of governing clauses (empty list if none exist yet — see
        coverage_gaps() to distinguish that from "not yet commenced").

        Returns {data_type: [clause_dict, ...]}, not a list of rows —
        this is the shape the DPDP Reasoner stage will want to iterate:
        one data node, its retrieved clauses, in a single call.
        """
        rows = self.client.run_read(
            CLAUSES_FOR_SYSTEM,
            {"system_name": system_name, "include_upcoming": include_upcoming},
        )
        result = {}
        for row in rows:
            clauses = [c for c in (row.get("clauses") or []) if c]
            result[row["data_type"]] = clauses
        return result

    def coverage_gaps(self, system_name: str = DEFAULT_SYSTEM_NAME) -> List[str]:
        """
        DataTypes the System collects that have ZERO governing clauses
        — no clause exists for this data type at all, distinct from a
        clause existing but not yet commenced. Worth periodically
        re-checking as the DPDP clause loader's taxonomy coverage
        improves; a nonzero result here after a full clause-loader run
        usually means the extractor under-tagged something, not that
        the Act genuinely has no bearing on that data type.
        """
        rows = self.client.run_read(COVERAGE_GAPS_FOR_SYSTEM, {"system_name": system_name})
        return [r["data_type"] for r in rows]

    def vendor_exposure_for_clause(self, clause_id: str) -> List[dict]:
        """
        Which vendors receive data governed by a given clause — e.g.
        point this at the consent clause (DPDP-s6) to see every vendor
        receiving data that requires valid consent under that section.
        """
        return self.client.run_read(VENDOR_EXPOSURE_FOR_CLAUSE, {"clause_id": clause_id})

    def clause_detail(self, clause_id: str) -> Optional[dict]:
        """Full detail for one clause: text, status, every data type it
        governs, and every vendor exposed to that data. Returns None if
        the clause_id doesn't exist (e.g. 'DPDP-s99' — a section number
        that was never a data-governing clause, or a typo)."""
        rows = self.client.run_read(CLAUSE_DETAIL, {"clause_id": clause_id})
        if not rows or rows[0].get("clause_id") is None:
            return None
        return rows[0]

    def upcoming_clauses(self, within_days: Optional[int] = None) -> List[dict]:
        """
        Clauses not yet in force, soonest-effective first. Pass
        within_days to filter to only what's commencing soon (e.g.
        within_days=90 for "what do we need ready this quarter").

        Filtered in Python, not Cypher — effective_from is stored as an
        ISO date string (see queries.py's docstring), and date-window
        filtering reads more clearly done once in Python than repeated
        across every query that might need it.
        """
        rows = self.client.run_read(UPCOMING_CLAUSES)
        if within_days is None:
            return rows
        cutoff = date.today() + timedelta(days=within_days)
        return [
            r for r in rows
            if r.get("effective_from") and date.fromisoformat(r["effective_from"]) <= cutoff
        ]

    def graph_summary(self) -> dict:
        """Lightweight counts across all node labels plus two derived
        signals (in-force clause count, data types with zero clauses) —
        a quick health-check / dashboard-ready summary, not a substitute
        for coverage_gaps() when you need the actual list."""
        rows = self.client.run_read(GRAPH_SUMMARY)
        return rows[0] if rows else {
            "systems": 0, "data_types": 0, "vendors": 0, "clauses": 0,
            "in_force_clauses": 0, "data_types_with_no_clause": 0,
        }
