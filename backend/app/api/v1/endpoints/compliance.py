"""
GET /api/v1/compliance/vendors
GET /api/v1/compliance/regulations
GET /api/v1/compliance/policies
GET /api/v1/compliance/audit

Groups the read-only "compliance surface" pages (Vendors, Regulations,
Policies, Audit Trail) under one router since they're all views over
the same reconciliation state served by gap_service.
"""

from fastapi import APIRouter

from app.schemas.audit import AuditResponse
from app.schemas.policies import PoliciesResponse
from app.schemas.regulations import RegulationsResponse
from app.schemas.vendors import VendorsResponse
from app.services import gap_service

router = APIRouter()


@router.get("/vendors", response_model=VendorsResponse)
def vendors():
    return gap_service.list_vendors()


@router.get("/regulations", response_model=RegulationsResponse)
def regulations():
    return gap_service.list_regulations()


@router.get("/policies", response_model=PoliciesResponse)
def policies():
    return gap_service.list_policies()


@router.get("/audit", response_model=AuditResponse)
def audit():
    return gap_service.list_audit_events()