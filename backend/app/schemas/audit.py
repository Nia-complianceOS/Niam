from typing import List

from pydantic import BaseModel


class AuditEvent(BaseModel):
    id: str
    occurred_at: str
    event_type: str
    title: str
    description: str
    actor: str


class AuditResponse(BaseModel):
    events: List[AuditEvent]
