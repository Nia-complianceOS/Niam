"""
Serves and mutates compliance gaps.

Real version: list_gaps()/get_gap() query Neo4j (or a Postgres table,
if we end up storing gap metadata outside the graph) for gap objects
written by the Data & Graph Intelligence module's reconciliation
engine. generate_fix() calls their remediation-drafting output.
Backend's job per the team boundary is to store/serve that JSON
as-is, not compute it — the mock data below is a stand-in for that
handoff so Frontend and route wiring can be built now.

Also home to the smaller "compliance surface" reads (vendors,
regulations, policies, audit trail) since they're all views over the
same reconciliation state and don't warrant their own service files
yet — split out later if any of them grows real logic.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.schemas.common import CommitRef, GapStatus, RegulationCode, ComplianceStatus
from app.schemas.gaps import Gap, GapsResponse, RemediationDraft
from app.schemas.vendors import Vendor, VendorsResponse
from app.schemas.regulations import RegulationCoverage, RegulationsResponse
from app.schemas.policies import Policy, PoliciesResponse
from app.schemas.audit import AuditEvent, AuditResponse

_NOW = lambda: datetime.now(timezone.utc)  # noqa: E731

# In-memory mock store, keyed by gap id. Replace with a real Neo4j/DB
# read in Phase B once the intelligence module's output exists.
_GAPS: dict[str, Gap] = {
    "gap-mixpanel-001": Gap(
        id="gap-mixpanel-001",
        title="Mixpanel Analytics — Missing Disclosure",
        status=GapStatus.OPEN,
        source_commit=CommitRef(
            sha="a3f92c1", message="feat: add Mixpanel analytics", author="dev1",
            repo="nova-labs/checkout-service", committed_at=_NOW() - timedelta(hours=2),
        ),
        vendor="Mixpanel",
        data_types=["IP Address", "Device ID", "Purchase Events"],
        affected_documents=["Privacy Policy", "Cookie Policy", "Vendor Register"],
        regulations=[RegulationCode.DPDP, RegulationCode.GDPR],
        ai_recommendation=(
            "Analytics tracking introduces a new third-party data flow. Privacy policy "
            "should disclose Mixpanel, and cookie consent should be requested before "
            "analytics loads."
        ),
        detected_at=_NOW() - timedelta(hours=2),
        updated_at=_NOW() - timedelta(hours=2),
    ),
    "gap-oauth-002": Gap(
        id="gap-oauth-002",
        title="Google OAuth — Missing Vendor Disclosure",
        status=GapStatus.RESOLVED,
        source_commit=CommitRef(
            sha="71adf3c", message="feat: add Google OAuth login", author="dev1",
            repo="nova-labs/checkout-service", committed_at=_NOW() - timedelta(days=2),
        ),
        vendor="Google Identity Services",
        data_types=["Email Address", "Full Name", "Profile Photo"],
        affected_documents=["Privacy Policy", "Vendor Register"],
        regulations=[RegulationCode.DPDP, RegulationCode.GDPR],
        ai_recommendation="OAuth login shares profile data with Google. Privacy policy should disclose the identity provider and fields requested at sign-in.",
        pr_id="pr-241",
        detected_at=_NOW() - timedelta(days=2),
        updated_at=_NOW() - timedelta(days=1),
    ),
}


def list_gaps() -> GapsResponse:
    gaps = list(_GAPS.values())
    open_count = sum(1 for g in gaps if g.status != GapStatus.RESOLVED)
    return GapsResponse(score=73, score_delta=-4, open_gap_count=open_count, gaps=gaps)


def get_gap(gap_id: str) -> Gap:
    gap = _GAPS.get(gap_id)
    if gap is None:
        raise HTTPException(status_code=404, detail=f"Gap '{gap_id}' not found")
    return gap


def generate_fix(gap_id: str) -> list[RemediationDraft]:
    """
    Mock of the Data & Graph Intelligence module's remediation-drafting
    step. Real version receives already-drafted RemediationDraft objects
    from that module rather than generating them here.
    """
    gap = get_gap(gap_id)
    drafts = [
        RemediationDraft(
            document="Privacy Policy", summary=f"Added {gap.vendor} disclosure",
            file_path="privacy-policy.md",
            diff_text=f"+ We use {gap.vendor} to understand product usage.\n+ Data is retained for 12 months.",
        ),
        RemediationDraft(
            document="Cookie Policy", summary="Added analytics cookie section",
            file_path="cookie-policy.md",
            diff_text=f"+ {gap.vendor} sets cookies to track sessions and events.",
        ),
        RemediationDraft(
            document="Vendor Register", summary=f"Added {gap.vendor} entry",
            file_path="vendor-register.md",
            diff_text=f"+ | {gap.vendor} | Product analytics | {', '.join(gap.data_types)} | 12mo |",
        ),
    ]
    gap.remediation_drafts = drafts
    gap.status = GapStatus.FIX_GENERATED
    gap.updated_at = _NOW()
    return drafts


def mark_pr_opened(gap_id: str, pr_id: str) -> None:
    gap = get_gap(gap_id)
    gap.pr_id = pr_id
    gap.status = GapStatus.PR_OPENED
    gap.updated_at = _NOW()


# ---------------------------------------------------------------------------
# Vendors / Regulations / Policies / Audit — other "compliance surface" reads
# ---------------------------------------------------------------------------

def list_vendors() -> VendorsResponse:
    return VendorsResponse(vendors=[
        Vendor(id="v-stripe", name="Stripe", category="Payments", data_collected="Card token, billing address",
               coverage_status=ComplianceStatus.COMPLIANT, coverage_detail="Covered"),
        Vendor(id="v-mixpanel", name="Mixpanel", category="Analytics", data_collected="IP, Device ID, Purchase Events",
               coverage_status=ComplianceStatus.GAP, coverage_detail="Gap: not disclosed"),
        Vendor(id="v-aws", name="AWS", category="Infrastructure", data_collected="Encrypted backups",
               coverage_status=ComplianceStatus.COMPLIANT, coverage_detail="Covered"),
        Vendor(id="v-openai", name="OpenAI", category="AI Assistant", data_collected="Support chat transcripts",
               coverage_status=ComplianceStatus.COMPLIANT, coverage_detail="Covered"),
        Vendor(id="v-sendgrid", name="SendGrid", category="Email", data_collected="Email address, name",
               coverage_status=ComplianceStatus.COMPLIANT, coverage_detail="Covered"),
        Vendor(id="v-google", name="Google Identity", category="Authentication", data_collected="Email, name, profile photo",
               coverage_status=ComplianceStatus.WARNING, coverage_detail="Review pending"),
    ])


def list_regulations() -> RegulationsResponse:
    return RegulationsResponse(regulations=[
        RegulationCoverage(code=RegulationCode.DPDP, score_label="93%",
                            missing_requirements=["Consent withdrawal flow logging", "Data principal grievance redressal SLA"],
                            mapped_controls=["Purpose limitation", "Consent capture", "Data minimisation"],
                            affected_systems=["Signup Form", "Database", "AWS"]),
        RegulationCoverage(code=RegulationCode.GDPR, score_label="82%",
                            missing_requirements=["Right to erasure automation", "DPA with Mixpanel not signed"],
                            mapped_controls=["Lawful basis mapping", "Cross-border transfer safeguards"],
                            affected_systems=["Mixpanel", "OpenAI", "Cookie Banner"]),
        RegulationCoverage(code=RegulationCode.SOC2, score_label="75%",
                            missing_requirements=["Quarterly access review evidence", "Incident response runbook"],
                            mapped_controls=["Access control", "Change management", "Monitoring & logging"],
                            affected_systems=["Backend API", "AWS", "Database"]),
        RegulationCoverage(code=RegulationCode.HIPAA, score_label="Coming Soon", enabled=False),
    ])


def list_policies() -> PoliciesResponse:
    return PoliciesResponse(policies=[
        Policy(id="p-privacy", name="Privacy Policy", status=ComplianceStatus.COMPLIANT, status_label="96% Coverage",
               description="Discloses all data collection, vendors, and retention windows across the product.",
               coverage_percent=96),
        Policy(id="p-cookie", name="Cookie Policy", status=ComplianceStatus.GAP, status_label="Missing Analytics",
               description="Analytics cookies from Mixpanel are not yet disclosed in the consent categories.",
               coverage_percent=71),
        Policy(id="p-terms", name="Terms of Service", status=ComplianceStatus.WARNING, status_label="Updated Today",
               description="Reflects the new AI assistant feature and updated liability clauses.",
               coverage_percent=100),
        Policy(id="p-retention", name="Retention Policy", status=ComplianceStatus.GAP, status_label="Needs Review",
               description="Support chat transcripts exceed the documented 30 day retention window.",
               coverage_percent=64),
    ])


def list_audit_events() -> AuditResponse:
    now = _NOW()
    return AuditResponse(events=[
        AuditEvent(id="a1", occurred_at=now - timedelta(hours=2), event_type="commit_detected",
                   title="Commit detected", description="a3f92c1 — feat: add Mixpanel analytics",
                   actor="GitHub · nova-labs/checkout-service"),
        AuditEvent(id="a2", occurred_at=now - timedelta(hours=2) + timedelta(minutes=1), event_type="policy_updated",
                   title="Policy updated", description="Privacy Policy drafted with Mixpanel disclosure", actor="CONTINUUM AI"),
        AuditEvent(id="a3", occurred_at=now - timedelta(hours=2) + timedelta(minutes=1), event_type="vendor_added",
                   title="Vendor added", description="Mixpanel added to vendor register", actor="CONTINUUM AI"),
        AuditEvent(id="a4", occurred_at=now - timedelta(days=1), event_type="pr_merged",
                   title="Pull request merged", description="#241 — Compliance Update: Google OAuth disclosure",
                   actor="Priya S. (Legal Team)"),
    ])