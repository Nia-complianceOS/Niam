from typing import List

from pydantic import BaseModel


class RegulationCoverage(BaseModel):
    code: str
    score_label: str | None = None
    enabled: bool = True
    missing_requirements: List[str] = []
    mapped_controls: List[str] = []
    affected_systems: List[str] = []
    next_commencement_date: str | None = None
    next_commencement_days: int | None = None


class RegulationsResponse(BaseModel):
    regulations: List[RegulationCoverage]
