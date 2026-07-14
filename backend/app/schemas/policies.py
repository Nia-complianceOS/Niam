from typing import List

from pydantic import BaseModel


class Policy(BaseModel):
    id: str
    name: str
    status: str
    status_label: str
    description: str
    coverage_percent: float


class PoliciesResponse(BaseModel):
    policies: List[Policy]
