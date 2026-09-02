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
    # Lines added/removed. Only the illustrative samples have this -- a
    # commit reconstructed from :Gap provenance carries no diff, and
    # inventing one would be exactly the kind of plausible-looking detail
    # this pass is removing.
    diff_stat: str = ""
    # How many gaps trace back to this commit. Real, countable, and what
    # the feed shows in place of a diff stat.
    gap_count: int = 0


class DashboardSummaryResponse(BaseModel):
    stat_cards: List[StatCard]
    timeline: List[TimelineStep]
    recent_commits: List[CommitActivity]
    synced_at: str

    # True when `timeline` / `recent_commits` are illustrative sample data
    # rather than anything that happened. The UI MUST label them when this
    # is set. Previously these two panels were hardcoded fiction returned
    # unconditionally -- not even behind USE_MOCKS -- so a fresh, empty
    # instance still showed a developer pushing a Mixpanel commit to
    # nova-labs/checkout-service.
    sample_panels: bool = False

    @field_validator("synced_at", mode="before")
    @classmethod
    def parse_synced_at(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value
