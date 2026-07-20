from typing import List

from pydantic import BaseModel


class Repository(BaseModel):
    id: str
    full_name: str
    branch: str = "main"
    score: float
    last_scanned_at: str
    status: str
    status_detail: str


class ReposResponse(BaseModel):
    repositories: List[Repository]
