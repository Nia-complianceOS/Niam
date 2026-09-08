"""
GET /api/v1/compliance/vendors
GET /api/v1/compliance/regulations
GET /api/v1/compliance/policies
GET /api/v1/compliance/audit

Groups the read-only "compliance surface" pages (Vendors, Regulations,
Policies, Audit Trail) under one router since they're all views over
the same reconciliation state served by gap_service.

All four are per-account. These are the pages whose rows name third-party
vendors a company integrates with and the file paths of its own legal
documents, so each one passes the authenticated user id down and reads
nothing without it. A new account sees four empty pages, which is what it
has.
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_auth
from app.schemas.audit import AuditResponse
from app.schemas.policies import PoliciesResponse
from app.schemas.regulations import RegulationsResponse
from app.schemas.vendors import VendorsResponse
from app.services import gap_service

router = APIRouter()


@router.get("/vendors", response_model=VendorsResponse)
def vendors(user_id: str = Depends(require_auth)):
    return gap_service.list_vendors(user_id)


@router.get("/regulations", response_model=RegulationsResponse)
def regulations(user_id: str = Depends(require_auth)):
    return gap_service.list_regulations(user_id)


@router.get("/policies", response_model=PoliciesResponse)
def policies(user_id: str = Depends(require_auth)):
    return gap_service.list_policies(user_id)


@router.get("/audit", response_model=AuditResponse)
def audit(user_id: str = Depends(require_auth)):
    return gap_service.list_audit_events(user_id)
