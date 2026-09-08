"""
reconciler.py — The core engine that compares detected data types and their vendors
against the DPDP Act clauses to derive compliance gaps and write them into the graph.

TENANCY (smoke/TENANCY_CONTRACT.md). Every read this engine issues is
filtered by `owner_id`, and every :Gap it writes carries one and is keyed
by an owner-prefixed id. See gap_id_prefix() below for the exact shape
and for why the stale-gap sweep is the sharpest edge in this file.
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


# --- gap identity -------------------------------------------------------
#
# A gap id was `gap-{system_name}-{data_type}-{vendor}`, scoped by system
# only. Two accounts that both scan a system under the default name --
# which every account does, DEFAULT_SYSTEM_NAME is a constant -- produced
# the SAME id for the same finding, so the second account's reconcile
# MERGEd onto the first account's :Gap node and overwrote its title,
# severity, source commit and remediation path.
#
# The id is owner-prefixed now, in the same shape GraphWriter already uses
# for :PolicyDocument ids (`policy-{owner_id}-{repo}-{path}`):
#
#     gap-{owner_id}-{system_name}-{data_type}-{vendor|none}
#     gap-{owner_id}-{system_name}-disclosure-{data_type}-{vendor|none}
#
# Both shapes share one prefix, `gap-{owner_id}-{system_name}-`, which is
# what RESOLVE_STALE_GAPS sweeps.
#
# THE DANGEROUS PART. That sweep resolves every gap matching the prefix
# that this run did not re-write. If the prefix could match another
# account's ids, a routine reconcile would silently mark somebody else's
# open findings "resolved" -- a compliance tool quietly closing an audit
# trail it does not own. Hyphens are not an unambiguous separator
# (owner "a" + system "b-c" and owner "a-b" + system "c" build the same
# prefix string), so the prefix ALONE is not enough. The sweep therefore
# also matches on the indexed `owner_id` property, which cannot be
# ambiguous. Both conditions, and neither is decorative: the property
# filter is the guarantee, the prefix keeps the sweep to this system.


def gap_id_prefix(owner_id: str, system_name: str) -> str:
    """The `STARTS WITH` prefix covering every gap id this (owner,
    system) pair writes. Must stay in lockstep with build_gap_id()."""
    if not owner_id:
        raise ValueError(
            "owner_id is required: an unowned gap id collides with every "
            "other account's gaps for the same system"
        )
    return f"gap-{owner_id}-{system_name}-"


def build_gap_id(
    owner_id: str,
    system_name: str,
    data_type: str,
    vendor: str | None,
    disclosure: bool = False,
) -> str:
    """One gap's id.

    `disclosure=True` gives the finding a distinct id: a disclosure
    finding and an Act-coverage finding about the same (data type,
    vendor) are different findings, and sharing an id means the second
    MERGE overwrites the first.
    """
    prefix = gap_id_prefix(owner_id, system_name)
    kind_segment = "disclosure-" if disclosure else ""
    return f"{prefix}{kind_segment}{data_type}-{vendor or 'none'}"


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

    `disclosed_data_types` and `named_recipients` must come from THIS
    account's policy documents. Reading them unfiltered meant another
    company's privacy policy could close your disclosure gap.
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

    Pure function of its arguments -- no graph access, so no owner. The
    owner filtering happens where `vendors` and `clauses` are READ.
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


# $id is already owner-prefixed (build_gap_id), and `owner_id` is set as a
# property besides -- the prefix keys the node, the property is what every
# read filters on and what the stale sweep trusts.
#
# Every node this gap attaches to is matched WITH the owner filter, except
# :DPDPClause, which is the shared Act (TENANCY_CONTRACT.md rule 2).
# Without those filters a gap could hang its INVOLVES edge off another
# account's :DataType node -- which is not just a wrong edge, it is a
# join that carries that account's data into this account's gap detail.
#
# STRUCTURE: each attachment is its own CALL unit subquery. It used to be
# a flat chain, and the `UNWIND (CASE WHEN $remediation_doc_id IS NOT NULL
# ... ELSE [] END)` in the middle of it eliminated every row whenever a
# gap had no remediation document -- which is every Act-coverage gap. The
# INVOLVES, AFFECTS and VIOLATES edges after it were then never written at
# all, so those gaps reached the drafter with no data type and no clauses.
# Inside a CALL subquery, row elimination stays inside that subquery.
MERGE_GAP = """
MERGE (g:Gap {id: $id})
ON CREATE SET g.owner_id = $owner_id,
              g.title = $title,
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
ON MATCH SET g.owner_id = $owner_id,
             g.title = $title,
             // Re-finding a gap means the condition still holds, so the
             // status resets -- that is what withdraws a 'resolved' claim
             // if a merged amendment did not actually fix it.
             //
             // 'pr_opened' is preserved, because a review that is still
             // out is still out. Resetting it to 'open' every reconcile
             // was how a finding sitting with legal quietly reverted to
             // looking untouched.
             g.status = CASE
                 WHEN $status = 'open' AND g.status = 'pr_opened'
                 THEN 'pr_opened' ELSE $status END,
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
CALL {
    WITH g
    UNWIND (CASE WHEN $remediation_doc_id IS NOT NULL
                 THEN [$remediation_doc_id] ELSE [] END) AS pid
    MATCH (pd:PolicyDocument {id: pid, owner_id: $owner_id})
    MERGE (g)-[:REMEDIED_IN]->(pd)
}
CALL {
    WITH g
    MATCH (d:DataType {owner_id: $owner_id, name: $data_type})
    MERGE (g)-[:INVOLVES]->(d)
}
CALL {
    WITH g
    UNWIND (CASE WHEN $vendor_name IS NOT NULL
                 THEN [$vendor_name] ELSE [] END) AS vname
    MATCH (v:Vendor {owner_id: $owner_id, name: vname})
    MERGE (g)-[:AFFECTS]->(v)
}
CALL {
    WITH g
    UNWIND $clause_ids AS clause_id
    MATCH (c:DPDPClause {clause_id: clause_id})
    MERGE (g)-[:VIOLATES]->(c)
}
"""


# Two conditions, both load-bearing. `owner_id` is the guarantee -- it is
# an indexed property that cannot be confused between accounts. The `id`
# prefix narrows the sweep to gaps from THIS system, so reconciling one
# system does not retire another system's findings within the same
# account. See the gap-identity note above for why the prefix alone was
# not safe enough to stand on.
RESOLVE_STALE_GAPS = """
MATCH (g:Gap {owner_id: $owner_id})
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
        owner_id: str | None = None,
    ):
        """`owner_id` is the account these gaps belong to, and it is
        required. It decides three things at once: which subgraph is
        read, what id each :Gap is keyed by, and which gaps the stale
        sweep is allowed to retire. Guessing it would mean writing one
        account's findings into another's dashboard and resolving that
        account's open gaps on the way out -- so this refuses instead.
        """
        if not owner_id:
            raise ValueError(
                "Reconciler requires owner_id -- gaps written without one "
                "collide with every other account's gaps"
            )
        self.client = client or Neo4jClient()
        self.system_name = system_name
        self.owner_id = owner_id

    def close(self):
        self.client.close()

    def find_and_write_gaps(self) -> dict:
        """
        Returns {"gaps_written": N, "gaps_by_kind": {...}}.
        """
        retriever = DPDPRetriever(self.client)
        clauses_by_dt = retriever.clauses_for_system(
            self.owner_id, self.system_name
        )

        # What the company's own legal documents disclose, read once for
        # the whole run rather than per data type. Scoped: another
        # company's privacy policy must not close this company's
        # disclosure gap.
        owner_param = {"owner_id": self.owner_id}
        rows = self.client.run_read(DISCLOSED_DATA_TYPES, owner_param)
        disclosed = set(rows[0]["data_types"] if rows else [])
        rows = self.client.run_read(NAMED_RECIPIENTS, owner_param)
        named_recipients = set(rows[0]["vendors"] if rows else [])
        rows = self.client.run_read(REMEDIATION_TARGET, owner_param)
        target = rows[0] if rows else None

        # No policy document in the graph means legal/load_policies.py has
        # not run for THIS owner. Reporting every collected data type as
        # undisclosed would be technically true only for a company that
        # has published nothing, and noise for everyone else -- so
        # disclosure checks are skipped entirely rather than guessed at.
        check_disclosure = target is not None
        if not check_disclosure:
            logger.info(
                "No :PolicyDocument nodes found for %s — skipping "
                "disclosure checks. Run `python -m legal.load_policies "
                "--owner %s` to enable them.",
                self.owner_id,
                self.owner_id,
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
                    VENDORS_FOR_DATA_TYPE,
                    {"owner_id": self.owner_id, "data_type": data_type},
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
                        "owner_id": self.owner_id,
                        "system_name": self.system_name,
                        "data_type": data_type,
                    },
                )
                collection_prov = latest_code_provenance(
                    collection_rows[0]["sources"] if collection_rows else []
                )

                for vendor in target_vendors:
                    # Two independent findings per pair: what the Act
                    # requires, and what the policy discloses. Either,
                    # both, or neither may apply.
                    findings = []
                    if kind is not None:
                        # A coverage finding needs a document to amend
                        # too. "Record the basis for this transfer and
                        # the safeguards around it" is a privacy-policy
                        # change like any other, and without a target the
                        # finding reaches the UI offering a fix it cannot
                        # perform -- open_compliance_pr() skips drafts
                        # with no file_path, so the button existed and
                        # could never work.
                        #
                        # future_obligation is the exception, and the
                        # reason this is not simply `target`: amending a
                        # privacy policy does not make a not-yet-commenced
                        # clause commence. That finding is a heads-up
                        # about a date, and there is nothing to edit.
                        findings.append(
                            (
                                severity,
                                kind,
                                None if kind == "future_obligation" else target,
                            )
                        )
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
                            {
                                "owner_id": self.owner_id,
                                "data_type": data_type,
                                "vendor": vendor,
                            },
                        )
                        egress_prov = latest_code_provenance(
                            egress_rows[0]["sources"] if egress_rows else []
                        )
                        prov = egress_prov or collection_prov

                    for f_severity, f_kind, f_target in findings:
                      # A disclosure finding and an Act finding about the
                      # same (data type, vendor) are different findings and
                      # need different ids, or the second MERGE overwrites
                      # the first. Both ids are owner-scoped and share the
                      # prefix the stale sweep uses.
                      f_gap_id = build_gap_id(
                          self.owner_id,
                          self.system_name,
                          data_type,
                          vendor,
                          # NOT `f_target is not None` any more: a coverage gap
                          # carries a target now, so that test would give a
                          # coverage and a disclosure finding about the same
                          # (data type, vendor) the same id -- and the second
                          # MERGE would overwrite the first.
                          disclosure=f_kind.startswith("undisclosed_"),
                      )
                      params = {
                        "id": f_gap_id,
                        "owner_id": self.owner_id,
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
        #
        # Scoped by owner_id AND by the owner-prefixed id -- see the
        # gap-identity note at the top of this file. This is the one write
        # in the engine that touches gaps it did not just create, so it is
        # the one place a missing filter would resolve another account's
        # findings instead of merely revealing them.
        resolved = 0
        if written_ids or clauses_by_dt:
            rows = self.client.run_write(
                RESOLVE_STALE_GAPS,
                {
                    "owner_id": self.owner_id,
                    "prefix": gap_id_prefix(self.owner_id, self.system_name),
                    "written_ids": written_ids,
                    "now": now,
                },
            )
            resolved = rows[0]["resolved"] if rows else 0
            if resolved:
                logger.info(
                    "Resolved %d gap(s) that no longer apply", resolved
                )

        logger.info(
            "Wrote %d gaps to the graph for %s", written, self.owner_id
        )
        return {
            "gaps_written": written,
            "gaps_resolved": resolved,
            "gaps_by_kind": kind_counts,
        }
