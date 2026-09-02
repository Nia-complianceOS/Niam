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
    DISCLOSED_DATA_TYPES,
    NAMED_RECIPIENTS,
    PROVENANCE_FOR_COLLECTION,
    PROVENANCE_FOR_EGRESS,
    REMEDIATION_TARGET,
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


def classify_disclosure_gap(
    data_type: str,
    vendor: str | None,
    disclosed_data_types: set,
    named_recipients: set,
) -> tuple[str | None, str | None]:
    """Compare what the code does against what the policy says.

    This is the half of "reconciliation" the product was named for and
    did not have. Until policy documents were in the graph, a gap could
    only mean "no clause governs this data type" -- a coverage question
    answered from the Act. This asks a different one: you collect this,
    have you said so?

    Returns (severity, kind), or (None, None) when the document already
    discloses it.

      undisclosed_sharing    -- data leaves for a vendor the policy never
                                names. The most serious of the three: the
                                data is gone and nobody was told.
      undisclosed_collection -- collected, and no document mentions it.
    """
    if vendor and vendor not in named_recipients:
        return "high", "undisclosed_sharing"
    if data_type not in disclosed_data_types:
        return "medium", "undisclosed_collection"
    return None, None


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
    if kind == "undisclosed_sharing":
        return (
            f"Undisclosed sharing: {data_type} sent to {vendor}, "
            "not named in any policy"
        )
    if kind == "undisclosed_collection":
        return f"Undisclosed collection: {data_type} is not disclosed"
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
              g.coverage_basis = $coverage_basis,
              g.remediation_path = $remediation_path,
              g.remediation_repo = $remediation_repo
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
             g.coverage_basis = $coverage_basis,
             g.remediation_path =
                 coalesce($remediation_path, g.remediation_path),
             g.remediation_repo =
                 coalesce($remediation_repo, g.remediation_repo)
WITH g

// The document this gap should be fixed in. It is what gives the drafter
// a file path and the pull request a real diff instead of an empty branch.
CALL {
    WITH g
    OPTIONAL MATCH (g)-[old:REMEDIED_IN]->(:PolicyDocument)
    DELETE old
}
WITH g
UNWIND (CASE WHEN $remediation_doc_id IS NOT NULL
             THEN [$remediation_doc_id] ELSE [] END) AS pid
MATCH (pd:PolicyDocument {id: pid})
MERGE (g)-[:REMEDIED_IN]->(pd)
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


RESOLVE_STALE_GAPS = """
MATCH (g:Gap)
WHERE g.id STARTS WITH $prefix
  AND NOT g.id IN $written_ids
  AND coalesce(g.status, 'open') <> 'resolved'
SET g.status = 'resolved',
    g.resolved_at = $now,
    g.updated_at = $now
RETURN count(g) AS resolved
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

        # What the company's own legal documents disclose, read once for
        # the whole run rather than per data type.
        rows = self.client.run_read(DISCLOSED_DATA_TYPES)
        disclosed = set(rows[0]["data_types"] if rows else [])
        rows = self.client.run_read(NAMED_RECIPIENTS)
        named_recipients = set(rows[0]["vendors"] if rows else [])
        rows = self.client.run_read(REMEDIATION_TARGET)
        target = rows[0] if rows else None

        # No policy document in the graph means legal/load_policies.py has
        # not run. Reporting every collected data type as undisclosed
        # would be technically true only for a company that has published
        # nothing, and noise for everyone else -- so disclosure checks are
        # skipped entirely rather than guessed at.
        check_disclosure = target is not None
        if not check_disclosure:
            logger.info(
                "No :PolicyDocument nodes found — skipping disclosure "
                "checks. Run `python -m legal.load_policies` to enable "
                "them."
            )

        now = datetime.now(timezone.utc).isoformat()

        written = 0
        written_ids = []
        skipped_malformed = []
        kind_counts = {
            "ungoverned_egress": 0,
            "future_obligation": 0,
            "ungoverned_collection": 0,
            "undisclosed_sharing": 0,
            "undisclosed_collection": 0,
        }

        for data_type, clauses in clauses_by_dt.items():
            try:
                # Query VENDORS_FOR_DATA_TYPE
                vendor_rows = self.client.run_read(
                    VENDORS_FOR_DATA_TYPE, {"data_type": data_type}
                )
                vendors = vendor_rows[0]["vendors"] if vendor_rows else []

                # Classify against the Act. `continue` used to happen
                # here when this returned nothing -- which also skipped
                # the disclosure check below, so a data type that was
                # properly governed could never be reported as
                # undisclosed. Those are independent questions.
                severity, kind = classify_gap(vendors, clauses)
                basis = coverage_basis(clauses)

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

                    # Two independent findings per pair: what the Act
                    # requires, and what the policy discloses. Either,
                    # both, or neither may apply.
                    findings = []
                    if kind is not None:
                        findings.append((severity, kind, None))
                    if check_disclosure:
                        d_sev, d_kind = classify_disclosure_gap(
                            data_type, vendor, disclosed, named_recipients
                        )
                        if d_kind is not None:
                            findings.append((d_sev, d_kind, target))
                    if not findings:
                        continue

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

                    for f_severity, f_kind, f_target in findings:
                      # A disclosure finding and an Act finding about the
                      # same (data type, vendor) are different findings and
                      # need different ids, or the second MERGE overwrites
                      # the first.
                      f_gap_id = (
                          gap_id
                          if f_target is None
                          else f"gap-{self.system_name}-disclosure-"
                               f"{data_type}-{vendor or 'none'}"
                      )
                      params = {
                        "id": f_gap_id,
                        "title": gap_title(f_kind, data_type, vendor),
                        "status": "open",
                        "severity": f_severity,
                        "kind": f_kind,
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
                        # The document that fixes this, when there is one.
                        # Only disclosure gaps have a target: amending a
                        # privacy policy does not make a not-yet-commenced
                        # clause commence.
                        "remediation_doc_id": (
                            f_target["id"] if f_target else None
                        ),
                        "remediation_path": (
                            f_target["path"] if f_target else None
                        ),
                        "remediation_repo": (
                            f_target["repo"] if f_target else None
                        ),
                      }

                      self.client.run_write(MERGE_GAP, params)
                      written_ids.append(f_gap_id)
                      written += 1
                      kind_counts[f_kind] = kind_counts.get(f_kind, 0) + 1

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

        # Close gaps this run no longer finds.
        #
        # The reconciler only ever MERGEd gaps, never retired them -- so a
        # gap survived being fixed. Amend the privacy policy, re-ingest it,
        # reconcile again, and the undisclosed_collection finding would sit
        # there open forever. For a tool whose whole claim is that it
        # tracks drift, a finding that cannot go away is worse than no
        # finding: the count only ever rises, so it stops meaning anything.
        #
        # Resolved rather than deleted, deliberately. The audit trail is
        # built from :Gap nodes (gap_service._QUERY_AUDIT), so deleting one
        # erases the evidence that it was ever detected and fixed -- which
        # is precisely the record a DPDP audit would ask for.
        resolved = 0
        if written_ids or clauses_by_dt:
            rows = self.client.run_write(
                RESOLVE_STALE_GAPS,
                {
                    "prefix": f"gap-{self.system_name}-",
                    "written_ids": written_ids,
                    "now": now,
                },
            )
            resolved = rows[0]["resolved"] if rows else 0
            if resolved:
                logger.info(
                    "Resolved %d gap(s) that no longer apply", resolved
                )

        logger.info("Wrote %d gaps to the graph", written)
        return {
            "gaps_written": written,
            "gaps_resolved": resolved,
            "gaps_by_kind": kind_counts,
        }
