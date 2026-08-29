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

from app.schemas.audit import AuditEvent, AuditResponse
from app.services.dashboard_service import _QUERY_GRAPH_SUMMARY
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

_QUERY_DPDP_GAPS = """
MATCH (d:DataType) WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause)
RETURN collect(d.name) AS missing_requirements
"""

_QUERY_VENDORS = """
MATCH (v:Vendor)
OPTIONAL MATCH (d:DataType)-[:SENT_TO]->(v)
OPTIONAL MATCH (d)-[:GOVERNED_BY]->(c:DPDPClause) WHERE c.status = 'in_force'
WITH v, d, count(c) > 0 AS dt_governed
WITH v, collect(d.name) AS data_types, collect(dt_governed) AS governed_list
RETURN elementId(v) AS id, v.name AS name, v.category AS category,
       data_types, governed_list
ORDER BY name
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
        source_commit=(
            CommitRef(
                sha=node["source_commit_sha"],
                message=node["source_commit_message"],
                author=node["source_commit_author"],
                repo=node["source_commit_repo"],
                branch=node.get("source_commit_branch", "main"),
                committed_at=node["source_commit_committed_at"],
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

    score = 73.0
    score_explanation = "Graph unreachable (mock score)"
    try:
        score_rows = run_query(_QUERY_GRAPH_SUMMARY)
        if score_rows:
            summary = score_rows[0]
            ungoverned = summary["data_types_with_no_clause"]
            total = summary["data_types"]
            score = float(round(100 * (1 - ungoverned / max(total, 1))))
            score_explanation = f"Calculated as 100 * (1 - {ungoverned} ungoverned / {max(total, 1)} total)"
    except RuntimeError:
        pass

    return GapsResponse(
        score=score,
        score_explanation=score_explanation,
        score_delta=-4.0,
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


def list_vendors() -> VendorsResponse:
    try:
        rows = run_query(_QUERY_VENDORS)
        vendors = []
        for row in rows:
            data_types = [dt for dt in row["data_types"] if dt]
            governed_list = (
                row["governed_list"][: len(data_types)] if data_types else []
            )

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
                    category=row["category"] or "Third Party",
                    data_collected=(
                        ", ".join(data_types) if data_types else "None"
                    ),
                    coverage_status=status,
                    coverage_detail=detail,
                )
            )
        return VendorsResponse(vendors=vendors)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


def list_regulations() -> RegulationsResponse:
    dpdp_score = "0%"
    missing_reqs = []

    try:
        rows = run_query(_QUERY_GRAPH_SUMMARY)
        if rows:
            summary = rows[0]
            ungoverned = summary["data_types_with_no_clause"]
            total = summary["data_types"]
            score = round(100 * (1 - ungoverned / max(total, 1)))
            dpdp_score = f"{score}%"

        gap_rows = run_query(_QUERY_DPDP_GAPS)
        if gap_rows:
            missing_reqs = gap_rows[0]["missing_requirements"]
    except RuntimeError:
        dpdp_score = "Graph unreachable"
        missing_reqs = ["Graph unreachable"]

    # Sourced from intelligence.legal.commencement
    from datetime import date

    try:
        import sys
        import os

        sys.path.append(os.path.abspath(".."))
        from intelligence.legal.commencement import TRANCHE_3_DATE
    except ImportError:
        TRANCHE_3_DATE = date(2027, 5, 13)

    today = date.today()
    days_remaining = (TRANCHE_3_DATE - today).days
    next_commencement_days = max(0, days_remaining)
    next_commencement_date = TRANCHE_3_DATE.isoformat()

    return RegulationsResponse(
        regulations=[
            RegulationCoverage(
                code=RegulationCode.DPDP,
                score_label=dpdp_score,
                missing_requirements=missing_reqs,
                mapped_controls=[
                    "Purpose limitation",
                    "Consent capture",
                    "Data minimisation",
                ],
                affected_systems=["Signup Form", "Database", "AWS"],
                next_commencement_date=next_commencement_date,
                next_commencement_days=next_commencement_days,
            ),
            RegulationCoverage(code=RegulationCode.GDPR, enabled=False),
            RegulationCoverage(code=RegulationCode.SOC2, enabled=False),
            RegulationCoverage(code=RegulationCode.HIPAA, enabled=False),
        ]
    )


def list_policies() -> PoliciesResponse:
    _check_mocks()
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


def list_audit_events() -> AuditResponse:
    _check_mocks()
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
                actor="CONTINUUM AI",
            ),
            AuditEvent(
                id="a3",
                occurred_at=now - timedelta(hours=2) + timedelta(minutes=1),
                event_type="vendor_added",
                title="Vendor added",
                description="Mixpanel added to vendor register",
                actor="CONTINUUM AI",
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
