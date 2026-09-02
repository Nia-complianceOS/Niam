"""
reconciler.py — The core engine that compares detected data types and their vendors
against the DPDP Act clauses to derive compliance gaps and write them into the graph.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from graph.neo4j_client import Neo4jClient
from graph.schema import DEFAULT_SYSTEM_NAME
from legal.commencement import imposes_data_obligation
from retrieval.dpdp_retrieval import DPDPRetriever
from retrieval.queries import (
    PROVENANCE_FOR_COLLECTION,
    PROVENANCE_FOR_EGRESS,
    VENDORS_FOR_DATA_TYPE,
)

logger = logging.getLogger(__name__)


def _section_of(clause) -> str:
    """Section number off a clause, whether it arrived as a Neo4j Node
    or as a plain dict -- clauses_for_system() merges both shapes."""
    try:
        return str(clause["section"])
    except (KeyError, TypeError, IndexError):
        return ""


def obligation_clauses(clauses: list) -> list:
    """The subset that actually obliges a Data Fiduciary."""
    return [c for c in clauses if imposes_data_obligation(_section_of(c))]


def coverage_basis(clauses: list) -> str:
    """How this data type is covered: "specific", "general" or "none".

    DPDPRetriever tags every clause it returns with `applies_via` --
    "specific" when the extractor named this data type, "general" when the
    clause applies to all personal data and therefore to this one too.
    Most of the DPDP Act is general: notice, consent, rights and
    cross-border transfer are written about personal data as such rather
    than about categories of it.

    Recording which basis a gap rests on is the difference between
    "s.9 governs children's data" and "no clause names this data type;
    the general obligations apply". Both are true findings. Only one of
    them should be stated as though the Act singled this data out.
    """
    obligations = obligation_clauses(clauses)
    if not obligations:
        return "none"
    if any(c.get("applies_via") == "specific" for c in obligations):
        return "specific"
    return "general"


def classify_gap(
    vendors: list, clauses: list
) -> tuple[str | None, str | None]:
    """
    Classify one (data type, vendor set) against its governing clauses.
    Returns (severity, kind), or (None, None) when there is no gap.

    ONLY CLAUSES THAT OBLIGE A DATA FIDUCIARY COUNT AS COVERAGE.

    This function used to ask `any(c["status"] == "in_force")` over every
    clause handed to it, and treat a single in-force clause as proof the
    data type was governed. Two things then combined to break it
    completely:

      1. DPDPRetriever merges the general-purpose "other_personal_data"
         clauses into EVERY collected data type -- correct behaviour, and
         in this graph it means every data type inherits the same set.
      2. The only sections in force today are s.36 (Power to call for
         information) and s.37 (Power of Central Government to issue
         directions) -- powers of the regulator, not duties of a
         fiduciary.

    So every data type inherited an in-force clause, every one classified
    as covered, and a scan that found 15 data types across 8 vendors
    produced exactly zero gaps while reporting success. Filtering to the
    substantive obligations (see legal/commencement.py) is what makes the
    question "is this data type governed?" mean anything.

    A second, quieter bug is fixed here too: a data type with no vendor
    but with a not-yet-commenced obligation used to fall through to
    (None, None) and disappear. Data you collect and hold, against a duty
    that starts in 2027, is precisely what a readiness inventory exists
    to list -- it is a low-severity future obligation, not nothing.
    """
    obligations = obligation_clauses(clauses)
    has_vendors = len(vendors) > 0
    has_obligations = len(obligations) > 0
    in_force = any(c["status"] == "in_force" for c in obligations)

    if not has_obligations:
        # Nothing in the Act obliges anyone about this data type. Leaving
        # the system makes it worse.
        return (
            ("high", "ungoverned_egress")
            if has_vendors
            else ("low", "ungoverned_collection")
        )

    if not in_force:
        # Covered, but not yet enforceable. Readiness, not breach --
        # egress still raises the stakes.
        return (
            ("medium", "future_obligation")
            if has_vendors
            else ("low", "future_obligation")
        )

    # An obligation that binds today applies to this data type. Covered.
    return None, None


def gap_title(kind: str, data_type: str, vendor: str | None) -> str:
    """Title a gap for what it actually is.

    Every gap used to be titled "Ungoverned data sharing" or "Ungoverned
    data collection" regardless of kind -- so a future_obligation gap, one
    where a clause DOES govern the data and simply has not commenced yet,
    was announced in the same words as a genuine coverage hole. Nearly the
    whole Act commences 2026-11-13 / 2027-05-13, so that mislabelling
    applied to most of the graph, and it overstates the finding in the one
    direction a compliance tool must not.
    """
    if kind == "future_obligation":
        return (
            f"Future obligation: {data_type} sent to {vendor}"
            if vendor
            else f"Future obligation: {data_type}"
        )
    if kind == "ungoverned_egress":
        return f"Ungoverned data sharing: {data_type} sent to {vendor}"
    return f"Ungoverned data collection: {data_type}"


def latest_code_provenance(sources: list) -> dict:
    """Newest code-origin provenance entry carrying a commit, or {}.

    `sources` is an array of JSON strings on the COLLECTS / SENT_TO edge
    (see graph/node_builder.py). Vendor-API entries are skipped: they
    describe a vendor schema, not a place in anybody's source tree, so
    they cannot supply a commit. A malformed entry is skipped rather than
    failing the gap -- provenance is evidence, not a precondition.
    """
    best = {}
    for entry in sources or []:
        try:
            parsed = json.loads(entry)
        except (TypeError, ValueError):
            continue
        if parsed.get("origin") != "code" or not parsed.get("commit_sha"):
            continue
        if parsed.get("detected_at", "") >= best.get("detected_at", ""):
            best = parsed
    return best


MERGE_GAP = """
MERGE (g:Gap {id: $id})
ON CREATE SET g.title = $title,
              g.status = $status,
              g.severity = $severity,
              g.kind = $kind,
              g.ai_recommendation = $ai_recommendation,
              g.detected_at = $now,
              g.updated_at = $now,
              g.source_commit_sha = $source_commit_sha,
              g.source_commit_message = $source_commit_message,
              g.source_commit_author = $source_commit_author,
              g.source_commit_repo = $source_commit_repo,
              g.source_commit_branch = $source_commit_branch,
              g.source_commit_committed_at = $source_commit_committed_at,
              g.source_file = $source_file,
              g.coverage_basis = $coverage_basis
ON MATCH SET g.title = $title,
             g.status = $status,
             g.severity = $severity,
             g.kind = $kind,
             g.updated_at = $now,
             // coalesce, not assignment: a later reconcile that happens to
             // find no provenance must not erase a commit an earlier one
             // established.
             g.source_commit_sha =
                 coalesce($source_commit_sha, g.source_commit_sha),
             g.source_commit_message =
                 coalesce($source_commit_message, g.source_commit_message),
             g.source_commit_author =
                 coalesce($source_commit_author, g.source_commit_author),
             g.source_commit_repo =
                 coalesce($source_commit_repo, g.source_commit_repo),
             g.source_commit_branch =
                 coalesce($source_commit_branch, g.source_commit_branch),
             g.source_commit_committed_at =
                 coalesce($source_commit_committed_at,
                          g.source_commit_committed_at),
             g.source_file = coalesce($source_file, g.source_file),
             g.coverage_basis = $coverage_basis
WITH g

MATCH (d:DataType {name: $data_type})
MERGE (g)-[:INVOLVES]->(d)
WITH g

UNWIND (CASE WHEN $vendor_name IS NOT NULL THEN [$vendor_name] ELSE [] END) AS vname
MATCH (v:Vendor {name: vname})
MERGE (g)-[:AFFECTS]->(v)
WITH g

UNWIND $clause_ids AS clause_id
MATCH (c:DPDPClause {clause_id: clause_id})
MERGE (g)-[:VIOLATES]->(c)
"""


class Reconciler:
    def __init__(
        self,
        client: Optional[Neo4jClient] = None,
        system_name: str = DEFAULT_SYSTEM_NAME,
    ):
        self.client = client or Neo4jClient()
        self.system_name = system_name

    def close(self):
        self.client.close()

    def find_and_write_gaps(self) -> dict:
        """
        Returns {"gaps_written": N, "gaps_by_kind": {...}}.
        """
        retriever = DPDPRetriever(self.client)
        clauses_by_dt = retriever.clauses_for_system(self.system_name)

        now = datetime.now(timezone.utc).isoformat()

        written = 0
        skipped_malformed = []
        kind_counts = {
            "ungoverned_egress": 0,
            "future_obligation": 0,
            "ungoverned_collection": 0,
        }

        for data_type, clauses in clauses_by_dt.items():
            try:
                # Query VENDORS_FOR_DATA_TYPE
                vendor_rows = self.client.run_read(
                    VENDORS_FOR_DATA_TYPE, {"data_type": data_type}
                )
                vendors = vendor_rows[0]["vendors"] if vendor_rows else []

                # Classify
                severity, kind = classify_gap(vendors, clauses)
                basis = coverage_basis(clauses)

                if kind is None:
                    # otherwise -> no gap
                    continue

                target_vendors = vendors if vendors else [None]
                clause_ids = [c["clause_id"] for c in clauses]

                # Provenance for the collection edge, used as the fallback
                # when an egress edge has none of its own.
                collection_rows = self.client.run_read(
                    PROVENANCE_FOR_COLLECTION,
                    {
                        "system_name": self.system_name,
                        "data_type": data_type,
                    },
                )
                collection_prov = latest_code_provenance(
                    collection_rows[0]["sources"] if collection_rows else []
                )

                for vendor in target_vendors:
                    # Gap ids are scoped by system name. Without this,
                    # reconciling a second system in the same database
                    # MERGEs onto the first system's gaps -- a smoke run
                    # would silently overwrite demo gaps, and two real
                    # products sharing an instance would collide outright.
                    gap_id = (
                        f"gap-{self.system_name}-{data_type}-"
                        f"{vendor or 'none'}"
                    )

                    title = gap_title(kind, data_type, vendor)

                    # Prefer the commit where the egress itself was seen;
                    # fall back to where the data type was collected.
                    prov = collection_prov
                    if vendor:
                        egress_rows = self.client.run_read(
                            PROVENANCE_FOR_EGRESS,
                            {"data_type": data_type, "vendor": vendor},
                        )
                        egress_prov = latest_code_provenance(
                            egress_rows[0]["sources"] if egress_rows else []
                        )
                        prov = egress_prov or collection_prov

                    params = {
                        "id": gap_id,
                        "title": title,
                        "status": "open",
                        "severity": severity,
                        "kind": kind,
                        "ai_recommendation": "",
                        "now": now,
                        "data_type": data_type,
                        "vendor_name": vendor,
                        "clause_ids": clause_ids,
                        # "specific" | "general" | "none" -- see
                        # coverage_basis(). Lets the UI distinguish a
                        # clause that named this data type from the
                        # general obligations that apply to everything.
                        "coverage_basis": basis,
                        # All None when the graph was written by a scan
                        # that predates commit resolution. That is a gap
                        # without a source commit, which the API reports
                        # honestly rather than substituting a repo.
                        "source_commit_sha": prov.get("commit_sha"),
                        "source_commit_message": prov.get("commit_message"),
                        "source_commit_author": prov.get("commit_author"),
                        "source_commit_repo": prov.get("repo"),
                        "source_commit_branch": prov.get("commit_branch"),
                        "source_commit_committed_at": prov.get(
                            "commit_committed_at"
                        ),
                        "source_file": prov.get("file"),
                    }

                    self.client.run_write(MERGE_GAP, params)
                    written += 1
                    kind_counts[kind] += 1

            except Exception as exc:
                skipped_malformed.append(
                    {"data_type": data_type, "error": str(exc)}
                )
                continue

        if skipped_malformed:
            logger.warning(
                "Skipped %d malformed gap evaluation(s): %s",
                len(skipped_malformed),
                [s["error"] for s in skipped_malformed],
            )

        logger.info("Wrote %d gaps to the graph", written)
        return {"gaps_written": written, "gaps_by_kind": kind_counts}
