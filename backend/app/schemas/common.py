from enum import Enum

from datetime import datetime

from pydantic import BaseModel, field_validator


class ComplianceStatus(str, Enum):
    compliant = "compliant"
    warning = "warning"
    gap = "gap"
    unknown = "unknown"

    COMPLIANT = compliant
    WARNING = warning
    GAP = gap
    UNKNOWN = unknown


class GapStatus(str, Enum):
    open = "open"
    fix_generated = "fix_generated"
    pr_opened = "pr_opened"
    resolved = "resolved"

    OPEN = open
    FIX_GENERATED = fix_generated
    PR_OPENED = pr_opened
    RESOLVED = resolved


class PRStatus(str, Enum):
    ready_for_review = "ready_for_review"
    awaiting_author = "awaiting_author"
    merged = "merged"
    closed = "closed"

    READY_FOR_REVIEW = ready_for_review
    AWAITING_AUTHOR = awaiting_author
    MERGED = merged
    CLOSED = closed


class RegulationCode(str, Enum):
    DPDP = "DPDP"
    GDPR = "GDPR"
    SOC2 = "SOC2"
    HIPAA = "HIPAA"


class CommitRef(BaseModel):
    sha: str
    message: str
    author: str
    repo: str
    branch: str = "main"
    committed_at: str

    @field_validator("committed_at", mode="before")
    @classmethod
    def parse_committed_at(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value
