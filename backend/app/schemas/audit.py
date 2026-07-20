from datetime import datetime
from typing import List

from pydantic import BaseModel, field_validator


class AuditEvent(BaseModel):
    id: str
    occurred_at: str
    event_type: str
    title: str
    description: str
    actor: str

    @field_validator("occurred_at", mode="before")
    @classmethod
    def parse_occurred_at(cls, value):
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class AuditResponse(BaseModel):
    events: List[AuditEvent]
