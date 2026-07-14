from typing import List

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.common import CommitRef


class RemediationDraft(BaseModel):
    document: str
    summary: str
    file_path: str | None = None
    diff_text: str | None = None


class Gap(BaseModel):
    id: str
    title: str
    status: str
    source_commit: CommitRef | None = None
    vendor: str | None = None
    data_types: List[str] = []
    affected_documents: List[str] = []
    regulations: List[str] = []
    ai_recommendation: str = ""
    remediation_drafts: List[RemediationDraft] = []
    pr_id: str | None = None
    detected_at: str | None = None
    updated_at: str | None = None

    @field_validator('detected_at', 'updated_at', mode='before')
    @classmethod
    def parse_timestamps(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class GapsResponse(BaseModel):
    score: float
    score_delta: float
    open_gap_count: int
    gaps: List[Gap]


class GenerateFixResponse(BaseModel):
    gap_id: str
    remediation_drafts: List[RemediationDraft]
