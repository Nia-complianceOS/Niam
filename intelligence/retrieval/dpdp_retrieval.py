"""
retrieval/dpdp_retrieval.py — thin retrieval layer over the Living
Compliance Graph. All methods are read-only (Neo4jClient.run_read).

This is the module the DPDP Reasoner stage (not yet built) will consume
next: clauses_for_system() is the direct input builder described in the
onboarding doc's Section 02 — "give it the data node plus the retrieved
clauses."

TENANCY (smoke/TENANCY_CONTRACT.md). `owner_id` is the FIRST argument of
every method that reads an owned label, and it is required -- there is no
default and no fallback. It is a per-call argument rather than
constructor state on purpose: a retriever built once and reused (the
drafter does exactly this, and the backend will) must not be able to
carry one request's owner into the next one's query.

The single exception is upcoming_clauses(), which reads only
:DPDPClause -- shared reference data, the same Act for every account.
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


def _require_owner(owner_id: str) -> str:
    """Refuse to run an unowned read.

    Python's own arity check already catches a caller that forgot the
    argument. This catches the more likely one: an owner_id that arrived
    as None or "" from an unauthenticated request or an env var that was
    never set. Without it that query matches nothing and the user is
    shown an empty graph, which looks exactly like a clean bill of
    health -- the worst possible failure for a compliance tool.
    """
    if not owner_id:
        raise ValueError(
            "owner_id is required: a read without one either returns "
            "nothing or returns another account's data"
        )
    return owner_id


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
        owner_id: str,
        data_type: str,
        include_upcoming: bool = True,
        include_general: bool = True,
    ) -> List[dict]:
        """
        All DPDP clauses governing a single data type, for one account.

        include_general=True (default) also includes clauses tagged
        GENERAL_DATA_TYPE ("other_personal_data") — see the module-level
        note above for why that's the semantically correct behavior,
        not an approximation. Pass False to see ONLY clauses that
        specifically named this exact data type.

        Note that the answer is account-specific even though the Act is
        not: the edge that connects a data type to a clause is created
        per owner by GraphWriter.link_clauses(), so this returns the
        clauses governing data THIS account was found to collect.

        Raises ValueError for a data_type outside DATA_TYPE_TAXONOMY —
        same fail-closed principle as the rest of the pipeline. A typo'd
        data_type silently returning an empty list would look identical
        to "genuinely no obligations apply", which is a dangerous
        ambiguity for a compliance tool to leave unresolved.
        """
        _require_owner(owner_id)
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
                {
                    "owner_id": owner_id,
                    "data_type": data_type,
                    "include_upcoming": include_upcoming,
                },
            )
        ]

        if include_general and data_type != self.GENERAL_DATA_TYPE:
            general_rows = self.client.run_read(
                CLAUSES_FOR_DATA_TYPE,
                {
                    "owner_id": owner_id,
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
        owner_id: str,
        system_name: str = DEFAULT_SYSTEM_NAME,
        include_upcoming: bool = True,
        include_general: bool = True,
    ) -> Dict[str, List[dict]]:
        """
        Every DataType the given System collects, each mapped to its
        list of governing clauses (empty list if none exist yet — see
        coverage_gaps() to distinguish that from "not yet commenced").

        The System is looked up by (owner_id, name): two accounts can
        both run a system called "niam-demo-system" and they are
        different systems.

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
        _require_owner(owner_id)
        rows = self.client.run_read(
            CLAUSES_FOR_SYSTEM,
            {
                "owner_id": owner_id,
                "system_name": system_name,
                "include_upcoming": include_upcoming,
            },
        )
        result = {}
        for row in rows:
            clauses = [c for c in (row.get("clauses") or []) if c]
            result[row["data_type"]] = [
                self._as_clause(c, self.APPLIES_SPECIFIC) for c in clauses
            ]

        if include_general:
            general_clauses = self.clauses_for_data_type(
                owner_id,
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
        owner_id: str,
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
        _require_owner(owner_id)
        by_data_type = self.clauses_for_system(
            owner_id,
            system_name,
            include_upcoming=True,
            include_general=include_general,
        )
        return sorted(
            dt for dt, clauses in by_data_type.items() if not clauses
        )

    def vendor_exposure_for_clause(
        self, owner_id: str, clause_id: str
    ) -> List[dict]:
        """
        Which of THIS account's vendors receive data governed by a given
        clause — e.g. point this at the consent clause (DPDP-s6) to see
        every vendor receiving data that requires valid consent under
        that section.

        The clause is shared; the exposure is not. Unfiltered, this
        answered "whose vendors" with "everybody's".
        """
        _require_owner(owner_id)
        return self.client.run_read(
            VENDOR_EXPOSURE_FOR_CLAUSE,
            {"owner_id": owner_id, "clause_id": clause_id},
        )

    def clause_detail(self, owner_id: str, clause_id: str) -> Optional[dict]:
        """Full detail for one clause: text, status, every data type it
        governs FOR THIS ACCOUNT, and every vendor of this account
        exposed to that data. Returns None if the clause_id doesn't exist
        (e.g. 'DPDP-s99' — a section number that was never a
        data-governing clause, or a typo).

        The clause itself is shared reference data and is matched without
        an owner filter, so a clause that exists is reported as existing
        for everyone -- correct, and what verifier.py's check 1 needs.
        Only the data types and vendors hanging off it are scoped."""
        _require_owner(owner_id)
        rows = self.client.run_read(
            CLAUSE_DETAIL, {"owner_id": owner_id, "clause_id": clause_id}
        )
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

        NO owner_id, deliberately: this reads only :DPDPClause, which is
        the same Act for every account (TENANCY_CONTRACT.md rule 2). An
        owner_id parameter here would be accepted, ignored, and would
        make an unscoped query look scoped -- worse than not having one.

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

    def graph_summary(self, owner_id: str) -> dict:
        """Counts across this account's node labels plus two derived
        signals (in-force clause count, data types with zero clauses) —
        a quick health-check / dashboard-ready summary, not a substitute
        for coverage_gaps() when you need the actual list.

        `clauses` / `in_force_clauses` count the shared Act and are the
        same for everyone; every other count is this account's own."""
        _require_owner(owner_id)
        rows = self.client.run_read(GRAPH_SUMMARY, {"owner_id": owner_id})
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
