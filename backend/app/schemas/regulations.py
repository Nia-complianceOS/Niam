from typing import List

from pydantic import BaseModel


class RegulationCoverage(BaseModel):
    code: str
    score_label: str
    enabled: bool = True
    missing_requirements: List[str] = []
    mapped_controls: List[str] = []
    affected_systems: List[str] = []


class RegulationsResponse(BaseModel):
    regulations: List[RegulationCoverage]
