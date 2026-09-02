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
    GRAPH_SUMMARY,
    UPCOMING_CLAUSES,
    VENDOR_EXPOSURE_FOR_CLAUSE,
)

logger = logging.getLogger(__name__)


class DPDPRetriever:
    def __init__(self, client: Optional[Neo4jClient] = None):
        self.client = client or Neo4jClient()

    def close(self):
        self.client.close()

    # --- core lookups -----------------------------------------------------

    # A clause tagged "other_personal_data" by the extractor means "this
    # obligation applies broadly to whatever personal data a fiduciary
    # holds" (per the extractor's own prompt instruction), not "this
    # obligation applies only to a literal DataType node named
    # other_personal_data". Structurally though, GOVERNED_BY only
    # connects to that one specific node — so without this fallback,
    # general-purpose sections (grounds for processing, notice, consent,
    # rights, cross-border transfer — most of the Act) never surface for
    # any of your actually-collected, specifically-named data types.
    GENERAL_DATA_TYPE = "other_personal_data"

    # How a clause reaches a data type. Both are real coverage; they are
    # not the same claim, and flattening them is why this graph could not
    # answer "which clause governs credit_card specifically?" -- every
    # data type came back with an identical list.
    #
    #   "specific" -- the extractor tagged this clause with THIS data
    #                 type by name (s.9 and children's data, say).
    #   "general"  -- the clause applies to all personal data, so it
    #                 applies here too. Most of the DPDP Act is like
    #                 this: notice, consent, rights and cross-border
    #                 transfer are written about personal data as such,
    #                 not about categories of it. That is a property of
    #                 the Act, not a weakness in the extraction -- but a
    #                 tool that cannot say which it is sounds like it is
    #                 guessing.
    APPLIES_SPECIFIC = "specific"
    APPLIES_GENERAL = "general"

    @staticmethod
    def _as_clause(record, applies_via: str) -> dict:
        """One clause as a plain dict, tagged with how it applies.

        Also normalises shape: CLAUSES_FOR_SYSTEM returns whole :DPDPClause
        nodes via collect(), CLAUSES_FOR_DATA_TYPE returns aliased columns,
        and callers were left handling both (json.dumps cannot serialise a
        Node at all, which quietly broke `query_cli for-system` without
        --summary).
        """
        clause = dict(record)
        clause["applies_via"] = applies_via
        return clause

    def clauses_for_data_type(
        self,
        data_type: str,
        include_upcoming: bool = True,
        include_general: bool = True,
    ) -> List[dict]:
        """
        All DPDP clauses governing a single data type.

        include_general=True (default) also includes clauses tagged
        GENERAL_DATA_TYPE ("other_personal_data") — see the module-level
        note above for why that's the semantically correct behavior,
        not an approximation. Pass False to see ONLY clauses that
        specifically named this exact data type.

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
        rows = [
            self._as_clause(r, self.APPLIES_SPECIFIC)
            for r in self.client.run_read(
                CLAUSES_FOR_DATA_TYPE,
                {"data_type": data_type, "include_upcoming": include_upcoming},
            )
        ]

        if include_general and data_type != self.GENERAL_DATA_TYPE:
            general_rows = self.client.run_read(
                CLAUSES_FOR_DATA_TYPE,
                {
                    "data_type": self.GENERAL_DATA_TYPE,
                    "include_upcoming": include_upcoming,
                },
            )
            # A clause that named this data type explicitly stays
            # "specific" even though it is also generally applicable --
            # the stronger claim wins.
            seen = {r["clause_id"] for r in rows}
            rows = rows + [
                self._as_clause(r, self.APPLIES_GENERAL)
                for r in general_rows
                if r["clause_id"] not in seen
            ]
            rows.sort(key=lambda r: int(r["section"]))

        return rows

    def clauses_for_system(
        self,
        system_name: str = DEFAULT_SYSTEM_NAME,
        include_upcoming: bool = True,
        include_general: bool = True,
    ) -> Dict[str, List[dict]]:
        """
        Every DataType the given System collects, each mapped to its
        list of governing clauses (empty list if none exist yet — see
        coverage_gaps() to distinguish that from "not yet commenced").

        include_general=True (default) merges in clauses tagged
        GENERAL_DATA_TYPE ("other_personal_data") for every collected
        data type — without this, general-purpose sections (grounds for
        processing, notice, consent, rights, cross-border transfer —
        most of the Act's substantive obligations) never show up for
        any specifically-named data type, since GOVERNED_BY only
        connects to the literal node the extractor tagged.

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
            result[row["data_type"]] = [
                self._as_clause(c, self.APPLIES_SPECIFIC) for c in clauses
            ]

        if include_general:
            general_clauses = self.clauses_for_data_type(
                self.GENERAL_DATA_TYPE,
                include_upcoming=include_upcoming,
                include_general=False,
            )
            for data_type, clauses in result.items():
                if data_type == self.GENERAL_DATA_TYPE:
                    continue
                seen = {c["clause_id"] for c in clauses}
                result[data_type] = clauses + [
                    self._as_clause(c, self.APPLIES_GENERAL)
                    for c in general_clauses
                    if c["clause_id"] not in seen
                ]
                result[data_type].sort(key=lambda c: int(c["section"]))

        return result

    def coverage_gaps(
        self,
        system_name: str = DEFAULT_SYSTEM_NAME,
        include_general: bool = True,
    ) -> List[str]:
        """
        DataTypes the System collects that have ZERO governing clauses
        (including general-purpose ones, if include_general=True) — a
        genuine gap, distinct from a clause existing but not yet
        commenced (that's still "covered", just not enforceable today).

        Built on clauses_for_system() rather than a separate raw query,
        so this can never drift out of sync with what that method
        actually considers "covered" — pass include_general=False to
        see gaps under the stricter "only exact-name matches count"
        reading instead.
        """
        by_data_type = self.clauses_for_system(
            system_name, include_upcoming=True, include_general=include_general
        )
        return sorted(
            dt for dt, clauses in by_data_type.items() if not clauses
        )

    def vendor_exposure_for_clause(self, clause_id: str) -> List[dict]:
        """
        Which vendors receive data governed by a given clause — e.g.
        point this at the consent clause (DPDP-s6) to see every vendor
        receiving data that requires valid consent under that section.
        """
        return self.client.run_read(
            VENDOR_EXPOSURE_FOR_CLAUSE, {"clause_id": clause_id}
        )

    def clause_detail(self, clause_id: str) -> Optional[dict]:
        """Full detail for one clause: text, status, every data type it
        governs, and every vendor exposed to that data. Returns None if
        the clause_id doesn't exist (e.g. 'DPDP-s99' — a section number
        that was never a data-governing clause, or a typo)."""
        rows = self.client.run_read(CLAUSE_DETAIL, {"clause_id": clause_id})
        if not rows or rows[0].get("clause_id") is None:
            return None
        return rows[0]

    def upcoming_clauses(
        self, within_days: Optional[int] = None
    ) -> List[dict]:
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
            r
            for r in rows
            if r.get("effective_from")
            and date.fromisoformat(r["effective_from"]) <= cutoff
        ]

    def graph_summary(self) -> dict:
        """Lightweight counts across all node labels plus two derived
        signals (in-force clause count, data types with zero clauses) —
        a quick health-check / dashboard-ready summary, not a substitute
        for coverage_gaps() when you need the actual list."""
        rows = self.client.run_read(GRAPH_SUMMARY)
        return (
            rows[0]
            if rows
            else {
                "systems": 0,
                "data_types": 0,
                "vendors": 0,
                "clauses": 0,
                "in_force_clauses": 0,
                "data_types_with_no_clause": 0,
            }
        )
