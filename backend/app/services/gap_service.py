"""
Serves and mutates compliance gaps.

STATUS AS OF PHASE 3.3: still serving mock data. The Data & Graph
Intelligence module has not landed Gap/DPDPClause nodes in Neo4j yet
(confirmed with the team — see the Data & Graph Contract Spec shared
separately). Real version: list_gaps()/get_gap() will query Neo4j for
Gap nodes written by the reconciliation engine; generate_fix() will
read already-drafted RemediationDraft nodes rather than generating
them here. Backend's job per the team boundary is to store/serve that
JSON as-is, not compute it.

This file is deliberately structured as an adapter seam: the Cypher
below (_QUERY_*) documents the exact shape Phase 3.3-real will query
once Gap nodes exist, and _gap_from_graph_row() shows how a Neo4j
record maps onto the existing Gap pydantic schema. Neither is called
yet — list_gaps()/get_gap() still read the in-memory mock store. When
Gap nodes land, the swap is: replace the mock dict lookup with
run_query(_QUERY_...) and pass each row through _gap_from_graph_row().
The response shape (Gap/GapsResponse) does not need to change.

Also home to the smaller "compliance surface" reads (vendors,
regulations, policies, audit trail) since they're all views over the
same reconciliation state and don't warrant their own service files
yet — split out later if any of them grows real logic.
"""

import json

from app.schemas.audit import AuditEvent, AuditResponse
# One definition of "a clause that obliges a Data Fiduciary", shared with
# the reconciler and graph_service. ss.36/37 are the only sections in
# force today and they bind the regulator, not the fiduciary -- counting
# them badged every vendor "Covered" while the gap engine disagreed.
from legal.commencement import FIDUCIARY_OBLIGATION_SECTIONS
from app.services.dashboard_service import _QUERY_GRAPH_SUMMARY
from app.services.scoring import compliance_score
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
# FUTURE CONTRACT — not called yet. Documents the Cypher gap_service.py will
# run once the Data & Graph Intelligence module writes :Gap nodes. See the
# Data & Graph Contract Spec for the full node/relationship definitions this
# assumes. Scoped to DPDP only for v1, matching Track 1's stated scope.
# ---------------------------------------------------------------------------


_QUERY_LIST_GAPS = """
MATCH (g:Gap)
OPTIONAL MATCH (g)-[:AFFECTS]->(v:Vendor)
OPTIONAL MATCH (g)-[:INVOLVES]->(d:DataType)
OPTIONAL MATCH (g)-[:VIOLATES]->(c:DPDPClause)
OPTIONAL MATCH (g)-[hd:HAS_DRAFT]->(rd:RemediationDraft)
RETURN g,
       v.name AS vendor_name,
       collect(DISTINCT d.name) AS data_type_names,
       collect(DISTINCT c.clause_id) AS clause_ids,
       collect(DISTINCT {
           document: rd.document, summary: rd.summary,
           file_path: rd.file_path, diff_text: rd.diff_text, order: hd.order
       }) AS drafts
ORDER BY g.detected_at DESC
"""

_QUERY_GET_GAP = _QUERY_LIST_GAPS.replace(
    "MATCH (g:Gap)", "MATCH (g:Gap {id: $gap_id})"
)

# generate_fix() and open_compliance_pr() (github_service.py) both need a
# Gap's remediation drafts to already exist as :RemediationDraft nodes once
# that stage is real — this project's job is to read/serve them, not draft
# them (that's the Data & Graph module's job per the team boundary).
_QUERY_HAS_DRAFTS = """
MATCH (g:Gap {id: $gap_id})-[:HAS_DRAFT]->(rd:RemediationDraft)
RETURN count(rd) AS draft_count
"""

# The systems actually in the graph. "Affected systems" used to be the
# literal list ["Signup Form", "Database", "AWS"] -- three strings nobody
# had measured, printed under a heading that implies they were found.
_QUERY_SYSTEMS = """
MATCH (s:System)-[:COLLECTS]->(:DataType)
RETURN collect(DISTINCT s.name) AS systems
"""

_QUERY_DPDP_GAPS = """
MATCH (d:DataType) WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause)
RETURN collect(d.name) AS missing_requirements
"""

# `sources` is the provenance array edge_builder.py writes onto SENT_TO:
# each entry is a JSON string carrying {"origin": "code"} or
# {"origin": "vendor"}. That distinction is the ONLY thing separating a
# vendor we have actually integrated with from a name Gemini read in a
# source file -- so the query has to return it.
_QUERY_VENDORS = """
MATCH (v:Vendor)
OPTIONAL MATCH (d:DataType)-[st:SENT_TO]->(v)
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
_QUERY_GENERAL_IN_FORCE = """
MATCH (:DataType {name: 'other_personal_data'})-[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.status = 'in_force' AND c.section IN $obligation_sections
RETURN count(c) AS in_force
"""


def _gap_from_graph_row(row: dict) -> Gap:
    """
    Adapter: maps one row of _QUERY_LIST_GAPS/_QUERY_GET_GAP onto the
    existing Gap pydantic schema. Not called yet — reference
    implementation for when Gap nodes exist. Kept here (rather than
    written from scratch later) so the contract and the code that
    will consume it stay in sync as the spec evolves.
    """
    node = row["g"]
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
        status=node["status"],
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
        pr_id=node.get("pr_id"),
        detected_at=node.get("detected_at"),
        updated_at=node.get("updated_at"),
    )


# ---------------------------------------------------------------------------
# MOCK STORE — active today. Swap for the queries above once Gap nodes exist.
# ---------------------------------------------------------------------------


def list_gaps() -> GapsResponse:
    try:
        rows = run_query(_QUERY_LIST_GAPS)
        gaps = [_gap_from_graph_row(r) for r in rows]
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    open_count = sum(1 for g in gaps if g.status != GapStatus.RESOLVED)

    # No invented default. If the graph cannot be read we say so, rather
    # than shipping 73.0 -- a number with no provenance that looked
    # exactly like a real measurement.
    score = None
    score_explanation = "Graph unreachable — no score available"
    try:
        score_rows = run_query(_QUERY_GRAPH_SUMMARY)
        if score_rows:
            summary = score_rows[0]
            score, score_explanation = compliance_score(
                summary["data_types_with_no_clause"], summary["data_types"]
            )
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


def get_gap(gap_id: str) -> Gap:
    try:
        rows = run_query(_QUERY_GET_GAP, {"gap_id": gap_id})
        if not rows:
            raise HTTPException(
                status_code=404, detail=f"Gap '{gap_id}' not found"
            )
        return _gap_from_graph_row(rows[0])
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


def generate_fix(gap_id: str) -> list[RemediationDraft]:
    gap = get_gap(gap_id)
    if gap.status == GapStatus.RESOLVED:
        raise HTTPException(
            status_code=400,
            detail=f"Gap '{gap_id}' is already resolved — no fix to generate",
        )

    try:
        rows = run_query(_QUERY_HAS_DRAFTS, {"gap_id": gap_id})
        draft_count = rows[0]["draft_count"] if rows else 0
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if draft_count == 0:
        try:
            import sys
            import os

            if os.path.abspath("..") not in sys.path:
                sys.path.append(os.path.abspath(".."))
            from intelligence.reasoning.drafter import RemediationDrafter

            drafter = RemediationDrafter()
            drafter.draft_and_write_for_gap(gap_id)
            drafter.close()
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Drafter failed: {exc}"
            )

        # Re-fetch the gap to get the newly generated drafts
        gap = get_gap(gap_id)

    try:
        run_query(
            """
        MATCH (g:Gap {id: $gap_id})
        SET g.status = 'fix_generated', g.updated_at = $now
        """,
            {"gap_id": gap_id, "now": _NOW().isoformat()},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return gap.remediation_drafts


def mark_pr_opened(gap_id: str, pr_id: str) -> None:
    get_gap(gap_id)
    try:
        run_query(
            """
        MATCH (g:Gap {id: $gap_id})
        SET g.pr_id = $pr_id, g.status = 'pr_opened', g.updated_at = $now
        """,
            {"gap_id": gap_id, "pr_id": pr_id, "now": _NOW().isoformat()},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ---------------------------------------------------------------------------
# Vendors / Regulations / Policies / Audit — other "compliance surface" reads
# (unchanged from Phase 2 — still mock, out of scope for this pass)
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


def list_vendors() -> VendorsResponse:
    sections = sorted(FIDUCIARY_OBLIGATION_SECTIONS)
    try:
        general_rows = run_query(
            _QUERY_GENERAL_IN_FORCE, {"obligation_sections": sections}
        )
        general_in_force = bool(
            general_rows and general_rows[0]["in_force"]
        )

        rows = run_query(_QUERY_VENDORS, {"obligation_sections": sections})
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


def list_regulations() -> RegulationsResponse:
    # Not "0%". An unread graph is not a graph scoring zero -- that is a
    # measurement, and we do not have one until the query returns.
    dpdp_score = "—"
    missing_reqs = []
    affected_systems: list[str] = []

    try:
        rows = run_query(_QUERY_GRAPH_SUMMARY)
        if rows:
            summary = rows[0]
            score, _ = compliance_score(
                summary["data_types_with_no_clause"], summary["data_types"]
            )
            dpdp_score = f"{score:.0f}%" if score is not None else "—"

        gap_rows = run_query(_QUERY_DPDP_GAPS)
        if gap_rows:
            missing_reqs = gap_rows[0]["missing_requirements"]

        system_rows = run_query(_QUERY_SYSTEMS)
        if system_rows:
            affected_systems = [
                s for s in (system_rows[0]["systems"] or []) if s
            ]
    except RuntimeError:
        dpdp_score = "Graph unreachable"
        missing_reqs = ["Graph unreachable"]

    # Sourced from intelligence.legal.commencement
    from datetime import date

    try:
        import sys
        import os

        # Guard the append. The sibling call site in generate_fix() already
        # did; this one ran on every request to /compliance/regulations and
        # grew sys.path by one entry each time.
        _parent = os.path.abspath("..")
        if _parent not in sys.path:
            sys.path.append(_parent)
        from intelligence.legal.commencement import (
            TRANCHE_2_DATE,
            TRANCHE_3_DATE,
        )
    except ImportError:
        TRANCHE_2_DATE = date(2026, 11, 13)
        TRANCHE_3_DATE = date(2027, 5, 13)

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


def list_policies() -> PoliciesResponse:
    # Returning 503 here surfaced "Not yet implemented — see
    # IMPLEMENTATION_ROADMAP.md Phase N" to the user as a red error
    # banner, leaking an internal filename and making a not-built feature
    # look like an outage. There is no policy-document store yet, so the
    # honest answer is an empty list and the page's own empty state.
    if not get_settings().use_mocks:
        return PoliciesResponse(policies=[])
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
MATCH (g:Gap)
OPTIONAL MATCH (g)-[:AFFECTS]->(v:Vendor)
RETURN g.id AS id, g.title AS title, g.status AS status,
       g.severity AS severity, g.kind AS kind, g.pr_id AS pr_id,
       g.detected_at AS detected_at, g.updated_at AS updated_at,
       v.name AS vendor
ORDER BY coalesce(g.updated_at, g.detected_at) DESC
LIMIT 100
"""


def list_audit_events() -> AuditResponse:
    """Real audit trail, derived from :Gap nodes.

    Every event here is backed by a property the reconciler actually
    wrote. The previous version returned invented entries -- a named
    person on a "Legal Team" merging pull request #241 -- which is the
    kind of detail that makes an audit trail look authoritative while
    being entirely fictional.
    """
    if not get_settings().use_mocks:
        try:
            rows = run_query(_QUERY_AUDIT)
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
