"""
Serves and mutates compliance gaps.

Everything here queries Neo4j. There is no mock store: list_gaps() and
get_gap() run the _QUERY_* Cypher below against :Gap nodes written by
reconciliation/reconciler.py, generate_fix() reads (and, if absent,
drafts) :RemediationDraft nodes, and the vendors/regulations/audit
reads are views over the same graph.

The header this replaces claimed the opposite -- "STATUS AS OF PHASE
3.3: still serving mock data... Neither is called yet" -- and sat above
working graph queries for long enough that anyone reading the file
first would have been actively misled about what the backend does.

Also home to the smaller "compliance surface" reads (vendors,
regulations, policies, audit trail) since they are all views over the
same reconciliation state and do not warrant their own service files
yet -- split out later if any of them grows real logic.

TENANCY (smoke/TENANCY_CONTRACT.md). Every public function here takes
`owner_id` first, sourced from Depends(require_auth), and every query
filters :Gap, :System, :DataType, :Vendor, :PolicyDocument and
:PullRequest on it. This file held the plainest instance of the bug the
contract exists for -- `MATCH (g:Gap)` -- which served every account's
findings, complete with vendor names, source file paths and commit SHAs
from private repositories, to whoever asked first.

:DPDPClause is matched unfiltered throughout: the Act is one shared
corpus. :RemediationDraft is unfiltered too, because it is only ever
reached through a :Gap that is filtered.

EMPTY ACCOUNT. Nothing here special-cases a new user, and nothing needs
to: every read returns zero rows, every aggregate returns zero, and the
score comes back None with an explanation rather than as a number. The
one thing to protect is that last part -- an empty graph is precisely
where 100% ("no ungoverned data types!") and 0% ("no coverage!") are
both arithmetically reachable and both false.
"""

import json

from app.schemas.audit import AuditEvent, AuditResponse
# One definition of "a clause that obliges a Data Fiduciary", shared with
# the reconciler and graph_service. ss.36/37 are the only sections in
# force today and they bind the regulator, not the fiduciary -- counting
# them badged every vendor "Covered" while the gap engine disagreed.
from legal.commencement import (
    FIDUCIARY_OBLIGATION_SECTIONS,
    TRANCHE_2_DATE,
    TRANCHE_3_DATE,
)
from app.services.dashboard_service import (
    _QUERY_GRAPH_SUMMARY,
    score_from_summary,
)
from app.db.database import run_query
from app.schemas.vendors import Vendor, VendorsResponse
from app.schemas.regulations import RegulationCoverage, RegulationsResponse
from app.schemas.policies import Policy, PoliciesResponse
from app.schemas.gaps import Gap, GapsResponse, RemediationDraft
from app.schemas.common import (
    CommitRef,
    ComplianceStatus,
    GapStatus,
    RegulationCode,
)
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from app.core.config import get_settings


def _check_mocks():
    if not get_settings().use_mocks:
        raise HTTPException(
            status_code=503,
            detail="Not yet implemented — see IMPLEMENTATION_ROADMAP.md Phase N",
        )


def _NOW():
    return datetime.now(timezone.utc)  # noqa: E731


# ---------------------------------------------------------------------------
# The Cypher this service runs. Scoped to DPDP only for v1.
# ---------------------------------------------------------------------------


# The HAS_PR match is not decoration. g.status = 'pr_opened' is a claim
# about a pull request that exists somewhere a lawyer can open; the
# :PullRequest node is the only evidence for it. When the two disagree --
# and they did, for every gap claimed before pull requests were persisted
# -- the evidence wins. A finding that says "with legal" while appearing
# in no review queue is worse than one that says nothing, because someone
# stops chasing it.
#
# Every owned label in the pattern carries the filter, including the ones
# reached by OPTIONAL MATCH from an already-filtered :Gap. That is
# redundant on a correct graph and it is the thing that still holds if a
# future edit changes how the pattern is anchored. :DPDPClause has no
# filter (shared law); :RemediationDraft has none (reached only through
# the filtered :Gap, per the contract).
#
# DEPENDENCY, worth stating because the failure is silent: :PullRequest
# is an owned label per the contract, so it is filtered here -- but the
# node is written by github_service._MERGE_PR, which must therefore SET
# pr.owner_id. Until it does, this OPTIONAL MATCH finds nothing, and
# _gap_from_graph_row() downgrades every 'pr_opened' gap to
# 'fix_generated' on the (correct, given no evidence) grounds that no
# :PullRequest node backs the claim. Any :PullRequest rows written
# before owner_id existed need backfilling for the same reason.
_QUERY_LIST_GAPS = """
MATCH (g:Gap {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:AFFECTS]->(v:Vendor {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:INVOLVES]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:VIOLATES]->(c:DPDPClause)
OPTIONAL MATCH (g)-[hd:HAS_DRAFT]->(rd:RemediationDraft)
OPTIONAL MATCH (g)-[:HAS_PR]->(pr:PullRequest {owner_id: $owner_id})
WITH g, v, d, c, hd, rd,
     head(collect(pr)) AS pr
RETURN g, pr,
       v.name AS vendor_name,
       collect(DISTINCT d.name) AS data_type_names,
       collect(DISTINCT c.clause_id) AS clause_ids,
       collect(DISTINCT {
           document: rd.document, summary: rd.summary,
           file_path: rd.file_path, diff_text: rd.diff_text, order: hd.order
       }) AS drafts
ORDER BY g.detected_at DESC
"""

# Note the owner_id stays in the property map alongside the id. A gap id
# is already owner-prefixed (`gap-{owner_id}-{system}-...`, see
# reconciler.gap_id_prefix), so matching on the id alone would usually be
# enough -- but "usually" is doing too much work for the query that backs
# GET /gaps/{id}, and the id is user-supplied.
_QUERY_GET_GAP = _QUERY_LIST_GAPS.replace(
    "MATCH (g:Gap {owner_id: $owner_id})",
    "MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})",
)

# generate_fix() and open_compliance_pr() (github_service.py) both need a
# Gap's remediation drafts to already exist as :RemediationDraft nodes once
# that stage is real — this project's job is to read/serve them, not draft
# them (that's the Data & Graph module's job per the team boundary).
_QUERY_HAS_DRAFTS = """
MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
      -[:HAS_DRAFT]->(rd:RemediationDraft)
RETURN count(rd) AS draft_count
"""

# The systems actually in the graph. "Affected systems" used to be the
# literal list ["Signup Form", "Database", "AWS"] -- three strings nobody
# had measured, printed under a heading that implies they were found.
_QUERY_SYSTEMS = """
MATCH (s:System {owner_id: $owner_id})
      -[:COLLECTS]->(:DataType {owner_id: $owner_id})
RETURN collect(DISTINCT s.name) AS systems
"""

_QUERY_DPDP_GAPS = """
MATCH (d:DataType {owner_id: $owner_id})
WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause)
RETURN collect(d.name) AS missing_requirements
"""

# `sources` is the provenance array edge_builder.py writes onto SENT_TO:
# each entry is a JSON string carrying {"origin": "code"} or
# {"origin": "vendor"}. That distinction is the ONLY thing separating a
# vendor we have actually integrated with from a name Gemini read in a
# source file -- so the query has to return it.
_QUERY_VENDORS = """
MATCH (v:Vendor {owner_id: $owner_id})
OPTIONAL MATCH (d:DataType {owner_id: $owner_id})-[st:SENT_TO]->(v)
WITH v, d, st,
     COUNT { MATCH (d)-[:GOVERNED_BY]->(c:DPDPClause)
             WHERE c.status = 'in_force'
               AND c.section IN $obligation_sections } > 0 AS dt_governed
WITH v,
     collect(DISTINCT {name: d.name, governed: dt_governed}) AS dts,
     reduce(acc = [], r IN collect(DISTINCT st) |
            acc + coalesce(r.sources, [])) AS sources
RETURN elementId(v) AS id, v.name AS name, v.category AS category,
       dts, sources
ORDER BY name
"""


# Clauses that apply to all personal data, and so to every data type,
# even though only the other_personal_data node carries the edge. Most of
# the DPDP Act is written this way.
#
# The owner filter matters even here, where the answer is a count of
# shared clauses: GOVERNED_BY edges are materialised per account by
# GraphWriter.link_clauses(), so an unfiltered match would count another
# account's edges and report general obligations in force for a user
# whose graph is empty.
_QUERY_GENERAL_IN_FORCE = """
MATCH (:DataType {owner_id: $owner_id, name: 'other_personal_data'})
      -[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.status = 'in_force' AND c.section IN $obligation_sections
RETURN count(c) AS in_force
"""


def _gap_from_graph_row(row: dict) -> Gap:
    """
    Adapter: maps one row of _QUERY_LIST_GAPS/_QUERY_GET_GAP onto the Gap
    pydantic schema. Called by both list_gaps() and get_gap().
    """
    node = row["g"]
    pr = row.get("pr")

    # A gap only counts as "with legal" if a pull request node backs it.
    # Downgraded to fix_generated rather than open: the drafts are real
    # and were generated, it is the review that never got as far as GitHub.
    status = node["status"]
    if pr is None:
        # A gap only counts as "with legal" if a pull request node backs
        # it. Downgraded to fix_generated rather than open: the drafts are
        # real and were generated; it is the review that never reached
        # GitHub.
        if status == "pr_opened":
            status = "fix_generated"
    elif pr.get("merged"):
        # The amendment landed. This overrides the stored value because a
        # reconcile between the merge and now would have reset the gap to
        # 'open' (MERGE_GAP's ON MATCH), which would show a finding as
        # outstanding while its fix sits merged in the repository.
        status = "resolved"
    elif pr.get("state") == "closed":
        status = "fix_generated"
    elif status == "open":
        # A reconcile that re-found this gap reset the status and lost the
        # fact that a review is out. The :PullRequest node did not move,
        # so it is the better evidence.
        status = "pr_opened"

    drafts = [
        RemediationDraft(
            document=d["document"],
            summary=d["summary"],
            file_path=d.get("file_path"),
            diff_text=d.get("diff_text"),
        )
        for d in sorted(
            row.get("drafts") or [], key=lambda d: d.get("order") or 0
        )
        if d.get("document")  # collect() with no HAS_DRAFT match yields [{}]
    ]
    return Gap(
        id=node["id"],
        title=node["title"],
        status=status,
        severity=node.get("severity"),
        kind=node.get("kind"),
        coverage_basis=node.get("coverage_basis"),
        source_file=node.get("source_file"),
        source_commit=(
            CommitRef(
                sha=node["source_commit_sha"],
                # .get() throughout, with honest placeholders. Direct
                # indexing raised KeyError on any gap written before the
                # reconciler carried commit metadata -- and a repo scanned
                # before that change still has those gaps in it. A gap with
                # a sha but no author is worth showing; it is not worth a
                # 500.
                message=node.get("source_commit_message") or "",
                author=node.get("source_commit_author") or "unknown",
                repo=node.get("source_commit_repo") or "",
                branch=node.get("source_commit_branch") or "main",
                committed_at=node.get("source_commit_committed_at") or "",
            )
            if node.get("source_commit_sha")
            else None
        ),
        vendor=row.get("vendor_name"),
        data_types=[dt for dt in (row.get("data_type_names") or []) if dt],
        affected_documents=node.get("affected_documents", []),
        regulations=[cid for cid in (row.get("clause_ids") or []) if cid]
        or [RegulationCode.DPDP],
        ai_recommendation=node.get("ai_recommendation", ""),
        remediation_drafts=drafts,
        pr_id=pr["id"] if pr is not None else None,
        pr_url=pr.get("url") if pr is not None else None,
        pr_number=pr.get("number") if pr is not None else None,
        detected_at=node.get("detected_at"),
        updated_at=node.get("updated_at"),
    )


# ---------------------------------------------------------------------------
# Gap reads and mutations, all graph-backed.
# ---------------------------------------------------------------------------


def list_gaps(owner_id: str) -> GapsResponse:
    """This account's gaps. An account with none gets an empty list, an
    open_gap_count of 0 and a score of None -- never a placeholder gap
    and never a placeholder number."""
    owner = {"owner_id": owner_id}
    try:
        # Same refresh the pull-request listing does. A finding whose
        # amendment was merged on GitHub should read as resolved here
        # without the reviewer having to visit another page first --
        # merging is the action that closes the loop, and it happens on
        # GitHub, where nothing here was watching.
        #
        # Imported inside the function: github_service imports this module
        # for Gap and RemediationDraft, so a module-level import would be
        # circular.
        from app.services import github_service

        github_service.refresh_pull_request_states(owner_id)
        rows = run_query(_QUERY_LIST_GAPS, owner)
        gaps = [_gap_from_graph_row(r) for r in rows]
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    open_count = sum(1 for g in gaps if g.status != GapStatus.RESOLVED)

    # No invented default. If the graph cannot be read we say so, rather
    # than shipping 73.0 -- a number with no provenance that looked
    # exactly like a real measurement. An account with an empty graph is
    # a different sentence again, and score_from_summary() writes it:
    # "No repository scanned yet", still with score None.
    score = None
    score_explanation = "Graph unreachable — no score available"
    try:
        score_rows = run_query(_QUERY_GRAPH_SUMMARY, owner)
        if score_rows:
            score, score_explanation = score_from_summary(score_rows[0])
    except RuntimeError:
        pass

    return GapsResponse(
        score=score,
        score_explanation=score_explanation,
        # No score_delta: nothing stores a previous score, so there is no
        # movement to report. Omitting it leaves the field None.
        open_gap_count=open_count,
        gaps=gaps,
    )


def get_gap(owner_id: str, gap_id: str) -> Gap:
    """One gap belonging to this account.

    A gap owned by somebody else is a 404, identical to a gap that does
    not exist. Distinguishing the two would confirm the existence of
    another account's finding to anyone who guessed its id.
    """
    try:
        rows = run_query(
            _QUERY_GET_GAP, {"gap_id": gap_id, "owner_id": owner_id}
        )
        if not rows:
            raise HTTPException(
                status_code=404, detail=f"Gap '{gap_id}' not found"
            )
        return _gap_from_graph_row(rows[0])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


def generate_fix(owner_id: str, gap_id: str) -> list[RemediationDraft]:
    gap = get_gap(owner_id, gap_id)
    if gap.status == GapStatus.RESOLVED:
        raise HTTPException(
            status_code=400,
            detail=f"Gap '{gap_id}' is already resolved — no fix to generate",
        )

    try:
        rows = run_query(
            _QUERY_HAS_DRAFTS, {"gap_id": gap_id, "owner_id": owner_id}
        )
        draft_count = rows[0]["draft_count"] if rows else 0
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if draft_count == 0:
        try:
            # Plain package import. This used to append os.path.abspath("..")
            # to sys.path and import `intelligence.reasoning.drafter`, while
            # scan_service.py imported `reconciliation.reconciler` -- so the
            # backend/ copy and the intelligence/ copy of the same modules
            # were BOTH loaded in one process, and editing one had no effect
            # on the other. niam-intelligence is now installed
            # (pip install -e ./intelligence), so there is one copy and no
            # path manipulation.
            from reasoning.drafter import RemediationDrafter

            drafter = RemediationDrafter()
            # (owner_id, gap_id), not (gap_id). The drafter reads the
            # gap's data types and vendors to write the amendment, and
            # it now scopes that read -- so drafting the wrong account's
            # gap is refused at the query rather than producing a draft
            # quoting somebody else's vendor list.
            drafter.draft_and_write_for_gap(owner_id, gap_id)
            drafter.close()
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Drafter failed: {exc}"
            )

        # Re-fetch the gap to get the newly generated drafts
        gap = get_gap(owner_id, gap_id)

    try:
        run_query(
            """
        MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
        SET g.status = 'fix_generated', g.updated_at = $now
        """,
            {
                "gap_id": gap_id,
                "owner_id": owner_id,
                "now": _NOW().isoformat(),
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return gap.remediation_drafts


def mark_pr_opened(owner_id: str, gap_id: str, pr_id: str) -> None:
    # The get_gap() call is the authorisation check as much as the
    # existence check -- it 404s on another account's gap before this
    # writes a pull request id onto it.
    get_gap(owner_id, gap_id)
    try:
        run_query(
            """
        MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
        SET g.pr_id = $pr_id, g.status = 'pr_opened', g.updated_at = $now
        """,
            {
                "gap_id": gap_id,
                "owner_id": owner_id,
                "pr_id": pr_id,
                "now": _NOW().isoformat(),
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ---------------------------------------------------------------------------
# Vendors / Regulations / Policies / Audit — other "compliance surface" reads
# ---------------------------------------------------------------------------


def _vendor_is_connected(sources: list) -> bool:
    """True only if an actual vendor-API ingestion produced one of these
    edges. Anything that came from the code scanner is a *mention*, not a
    connection -- see ingestion/github/classifier.py, where `vendor` is
    free text the model writes ("Stripe", "Redis", "Firebase") with no
    taxonomy validation and no API call behind it."""
    for entry in sources or []:
        try:
            if json.loads(entry).get("origin") == "vendor":
                return True
        except (TypeError, ValueError):
            continue
    return False


def list_vendors(owner_id: str) -> VendorsResponse:
    """This account's vendors. Empty list for an account that has not
    scanned anything -- there is no "no vendors found" placeholder row,
    because an empty register and an unread one look identical once one
    of them is printed as a row."""
    sections = sorted(FIDUCIARY_OBLIGATION_SECTIONS)
    params = {"owner_id": owner_id, "obligation_sections": sections}
    try:
        general_rows = run_query(_QUERY_GENERAL_IN_FORCE, params)
        general_in_force = bool(
            general_rows and general_rows[0]["in_force"]
        )

        rows = run_query(_QUERY_VENDORS, params)
        vendors = []
        for row in rows:
            pairs = [d for d in (row.get("dts") or []) if d and d.get("name")]
            data_types = [d["name"] for d in pairs]
            # A general in-force obligation governs every data type.
            governed_list = [
                d["governed"] or general_in_force for d in pairs
            ]
            connected = _vendor_is_connected(row.get("sources"))

            if not data_types:
                status = ComplianceStatus.COMPLIANT
                detail = "No data collected"
            elif all(governed_list):
                status = ComplianceStatus.COMPLIANT
                detail = "Covered"
            elif any(governed_list):
                status = ComplianceStatus.WARNING
                detail = "Partially covered"
            else:
                status = ComplianceStatus.GAP
                detail = "Gap: not disclosed"

            vendors.append(
                Vendor(
                    id=row["id"],
                    name=row["name"] or "Unknown",
                    category=row["category"],
                    data_collected=(
                        ", ".join(data_types) if data_types else "None"
                    ),
                    coverage_status=status,
                    coverage_detail=detail,
                    connection_active=connected,
                    discovered_via="vendor_api" if connected else "code_scan",
                )
            )
        return VendorsResponse(vendors=vendors)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


def list_regulations(owner_id: str) -> RegulationsResponse:
    # Not "0%". An unread graph is not a graph scoring zero -- that is a
    # measurement, and we do not have one until the query returns. Nor is
    # an EMPTY graph a graph scoring zero: a brand-new account reaches
    # the same "—" by the score_from_summary() branch below, with no
    # missing requirements and no affected systems, which is the truthful
    # shape of "we have not looked yet".
    dpdp_score = "—"
    missing_reqs = []
    affected_systems: list[str] = []
    owner = {"owner_id": owner_id}

    try:
        rows = run_query(_QUERY_GRAPH_SUMMARY, owner)
        if rows:
            score, _ = score_from_summary(rows[0])
            dpdp_score = f"{score:.0f}%" if score is not None else "—"

        gap_rows = run_query(_QUERY_DPDP_GAPS, owner)
        if gap_rows:
            missing_reqs = gap_rows[0]["missing_requirements"]

        system_rows = run_query(_QUERY_SYSTEMS, owner)
        if system_rows:
            affected_systems = [
                s for s in (system_rows[0]["systems"] or []) if s
            ]
    except RuntimeError:
        dpdp_score = "Graph unreachable"
        missing_reqs = ["Graph unreachable"]

    # Sourced from legal.commencement, imported at module scope now -- see
    # the top of this file. The old version appended to sys.path on EVERY
    # request to /compliance/regulations and imported through the
    # `intelligence.` prefix, loading a second copy of the module.
    from datetime import date

    # "Next commencement" means the next one that has not happened yet.
    # This previously hardcoded TRANCHE_3 and so counted down to 13 May
    # 2027 while Tranche 2 (13 Nov 2026) was still ahead of it -- roughly
    # six months wrong, and contradicted by our own commencement.py.
    today = date.today()
    upcoming = sorted(d for d in (TRANCHE_2_DATE, TRANCHE_3_DATE) if d >= today)
    next_date = upcoming[0] if upcoming else TRANCHE_3_DATE
    next_commencement_days = max(0, (next_date - today).days)
    next_commencement_date = next_date.isoformat()

    return RegulationsResponse(
        regulations=[
            RegulationCoverage(
                code=RegulationCode.DPDP,
                score_label=dpdp_score,
                missing_requirements=missing_reqs,
                # Empty on purpose. A "mapped control" would have to be a
                # control we had mapped -- there is no control register in
                # the graph and nothing maps clauses to one. The accordion
                # renders an empty column as "—", which is the truth.
                mapped_controls=[],
                # Real :System nodes that collect at least one data type.
                affected_systems=affected_systems,
                next_commencement_date=next_commencement_date,
                next_commencement_days=next_commencement_days,
            ),
            RegulationCoverage(code=RegulationCode.GDPR, enabled=False),
            RegulationCoverage(code=RegulationCode.SOC2, enabled=False),
            RegulationCoverage(code=RegulationCode.HIPAA, enabled=False),
        ]
    )


# Deliberately NOT retrieval.queries.POLICY_DOCUMENTS, though the two
# walk the same three patterns. That one returns the disclosed data type
# and recipient NAMES for the reconciler to reason over; this one returns
# only their counts, and orders privacy policies first because that is
# the order the Policies page reads in. Unifying them would mean shipping
# every disclosed data type name to a page that renders "7 of 12".
#
# What was NOT deliberate was this copy having no owner filter while the
# retrieval one had three: unfiltered, it listed every account's legal
# documents by name and path, and divided their disclosure counts by this
# account's collected total to produce a coverage percentage about nobody.
_QUERY_POLICY_DOCUMENTS = """
MATCH (p:PolicyDocument {owner_id: $owner_id})
OPTIONAL MATCH (p)-[:DISCLOSES]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (p)-[:NAMES_RECIPIENT]->(v:Vendor {owner_id: $owner_id})
RETURN p.id AS id, p.name AS name, p.path AS path, p.kind AS kind,
       p.summary AS summary, p.extraction_ok AS extraction_ok,
       count(DISTINCT d) AS disclosed_count,
       count(DISTINCT v) AS named_recipient_count
ORDER BY CASE p.kind WHEN 'privacy_policy' THEN 0 ELSE 1 END, p.path
"""

# How many data types the system actually collects -- the denominator for
# "what fraction of what we collect have we disclosed".
_QUERY_COLLECTED_COUNT = """
MATCH (:System {owner_id: $owner_id})
      -[:COLLECTS]->(d:DataType {owner_id: $owner_id})
RETURN count(DISTINCT d) AS collected
"""


def list_policies(owner_id: str) -> PoliciesResponse:
    """The company's own legal documents, and how much they disclose.

    Real since Phase H. This returned an empty list before that, because
    no policy document existed anywhere in the system -- which was the
    honest answer at the time, and also the reason "generate fix" had
    nothing to amend and would have opened an empty pull request.

    coverage_percent is disclosed data types over collected data types.
    It is a disclosure measure, not a quality one: a policy can disclose
    everything and still be badly written.

    An account with no policy documents gets an empty list, which is the
    same answer this gave before any policy document existed anywhere --
    and still the right one, because "no documents found" is a finding a
    user can act on and an invented row is not.
    """
    if not get_settings().use_mocks:
        owner = {"owner_id": owner_id}
        try:
            rows = run_query(_QUERY_POLICY_DOCUMENTS, owner)
            collected_rows = run_query(_QUERY_COLLECTED_COUNT, owner)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

        collected = (
            collected_rows[0]["collected"] if collected_rows else 0
        )

        policies = []
        for row in rows:
            disclosed = row["disclosed_count"]
            # No collected data types means nothing to disclose yet, which
            # is not the same as full coverage -- report 0 rather than
            # dividing by zero into a flattering number.
            percent = (
                round(100 * disclosed / collected) if collected else 0
            )

            if row.get("extraction_ok") is False:
                status = ComplianceStatus.WARNING
                label = "Not analysed"
            elif collected and disclosed >= collected:
                status = ComplianceStatus.COMPLIANT
                label = f"{percent}% disclosed"
            elif disclosed:
                status = ComplianceStatus.WARNING
                label = f"{percent}% disclosed"
            else:
                status = ComplianceStatus.GAP
                label = "Discloses nothing we collect"

            names = row["named_recipient_count"]
            description = row.get("summary") or ""
            detail = (
                f"{disclosed} of {collected} collected data type(s) "
                f"disclosed · {names} recipient(s) named"
            )
            description = f"{description} {detail}".strip()

            policies.append(
                Policy(
                    id=row["id"],
                    name=row["name"],
                    status=status,
                    status_label=label,
                    description=description,
                    coverage_percent=percent,
                )
            )
        return PoliciesResponse(policies=policies)
    return PoliciesResponse(
        policies=[
            Policy(
                id="p-privacy",
                name="Privacy Policy",
                status=ComplianceStatus.COMPLIANT,
                status_label="96% Coverage",
                description="Discloses all data collection, vendors, and retention windows across the product.",
                coverage_percent=96,
            ),
            Policy(
                id="p-cookie",
                name="Cookie Policy",
                status=ComplianceStatus.GAP,
                status_label="Missing Analytics",
                description="Analytics cookies from Mixpanel are not yet disclosed in the consent categories.",
                coverage_percent=71,
            ),
            Policy(
                id="p-terms",
                name="Terms of Service",
                status=ComplianceStatus.WARNING,
                status_label="Updated Today",
                description="Reflects the new AI assistant feature and updated liability clauses.",
                coverage_percent=100,
            ),
            Policy(
                id="p-retention",
                name="Retention Policy",
                status=ComplianceStatus.GAP,
                status_label="Needs Review",
                description="Support chat transcripts exceed the documented 30 day retention window.",
                coverage_percent=64,
            ),
        ]
    )


_QUERY_AUDIT = """
MATCH (g:Gap {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:AFFECTS]->(v:Vendor {owner_id: $owner_id})
RETURN g.id AS id, g.title AS title, g.status AS status,
       g.severity AS severity, g.kind AS kind, g.pr_id AS pr_id,
       g.detected_at AS detected_at, g.updated_at AS updated_at,
       g.resolved_at AS resolved_at,
       v.name AS vendor
ORDER BY coalesce(g.updated_at, g.detected_at) DESC
LIMIT 100
"""


def list_audit_events(owner_id: str) -> AuditResponse:
    """Real audit trail, derived from :Gap nodes.

    Every event here is backed by a property the reconciler actually
    wrote. The previous version returned invented entries -- a named
    person on a "Legal Team" merging pull request #241 -- which is the
    kind of detail that makes an audit trail look authoritative while
    being entirely fictional.

    An account with no gaps has an empty trail. Nothing has happened to
    it yet, and that is exactly what an audit trail should say.
    """
    if not get_settings().use_mocks:
        try:
            rows = run_query(_QUERY_AUDIT, {"owner_id": owner_id})
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

        events: list[AuditEvent] = []
        for row in rows:
            if row.get("detected_at"):
                vendor = f" · {row['vendor']}" if row.get("vendor") else ""
                events.append(
                    AuditEvent(
                        id=f"{row['id']}-detected",
                        occurred_at=row["detected_at"],
                        event_type="gap_detected",
                        title="Compliance gap detected",
                        description=(
                            f"{row.get('title') or row['id']}"
                            f" ({row.get('severity') or 'unknown'} severity"
                            f", {row.get('kind') or 'unclassified'})"
                        ),
                        actor=f"Reconciler{vendor}",
                    )
                )
            if row.get("resolved_at"):
                # The other end of the lifecycle. A reconcile that no
                # longer finds a gap marks it resolved, so the trail shows
                # detection AND closure -- which is the record a DPDP audit
                # actually asks for, and the reason gaps are retired rather
                # than deleted.
                events.append(
                    AuditEvent(
                        id=f"{row['id']}-resolved",
                        occurred_at=row["resolved_at"],
                        event_type="gap_resolved",
                        title="Compliance gap resolved",
                        description=(
                            f"{row.get('title') or row['id']} no longer "
                            "detected"
                        ),
                        actor="Reconciler",
                    )
                )
            if row.get("pr_id"):
                events.append(
                    AuditEvent(
                        id=f"{row['id']}-pr",
                        occurred_at=row.get("updated_at")
                        or row["detected_at"],
                        event_type="pr_opened",
                        title="Pull request opened",
                        description=f"{row['pr_id']} for {row['id']}",
                        actor="niam-bot",
                    )
                )
        events.sort(key=lambda e: e.occurred_at, reverse=True)
        return AuditResponse(events=events)

    now = _NOW()
    return AuditResponse(
        events=[
            AuditEvent(
                id="a1",
                occurred_at=now - timedelta(hours=2),
                event_type="commit_detected",
                title="Commit detected",
                description="a3f92c1 — feat: add Mixpanel analytics",
                actor="GitHub · nova-labs/checkout-service",
            ),
            AuditEvent(
                id="a2",
                occurred_at=now - timedelta(hours=2) + timedelta(minutes=1),
                event_type="policy_updated",
                title="Policy updated",
                description="Privacy Policy drafted with Mixpanel disclosure",
                actor="Niam AI",
            ),
            AuditEvent(
                id="a3",
                occurred_at=now - timedelta(hours=2) + timedelta(minutes=1),
                event_type="vendor_added",
                title="Vendor added",
                description="Mixpanel added to vendor register",
                actor="Niam AI",
            ),
            AuditEvent(
                id="a4",
                occurred_at=now - timedelta(days=1),
                event_type="pr_merged",
                title="Pull request merged",
                description="#241 — Compliance Update: Google OAuth disclosure",
                actor="Priya S. (Legal Team)",
            ),
        ]
    )
