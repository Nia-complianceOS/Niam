from datetime import datetime
from typing import List

from pydantic import BaseModel, field_validator

from app.schemas.common import CommitRef


class StatCard(BaseModel):
    label: str
    value: str
    sub_label: str
    sub_tone: str
    score_explanation: str | None = None


class TimelineStep(BaseModel):
    title: str
    meta: str | None = None
    state: str
    tag: str | None = None
    tag_tone: str | None = None


class CommitActivity(BaseModel):
    commit: CommitRef
    has_compliance_impact: bool
    diff_stat: str


class DashboardSummaryResponse(BaseModel):
    stat_cards: List[StatCard]
    timeline: List[TimelineStep]
    recent_commits: List[CommitActivity]
    synced_at: str

    @field_validator("synced_at", mode="before")
    @classmethod
    def parse_synced_at(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value
