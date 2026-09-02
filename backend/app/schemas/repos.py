from typing import List

from pydantic import BaseModel


class Repository(BaseModel):
    id: str
    full_name: str
    branch: str = "main"
    private: bool = False
    # None until a repository has actually been scanned. These used to be
    # required, which forced list_repositories() to invent a score and a
    # compliance status for every repo -- numbers that described nothing.
    score: float | None = None
    last_scanned_at: str | None = None
    status: str | None = None
    status_detail: str | None = None
    pushed_at: str | None = None


class ReposResponse(BaseModel):
    repositories: List[Repository]
    # True when the token can see more than were returned.
    truncated: bool = False
