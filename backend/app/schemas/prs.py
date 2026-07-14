from typing import List

from pydantic import BaseModel

from app.schemas.gaps import RemediationDraft


class PullRequest(BaseModel):
    id: str
    gap_id: str
    title: str
    repo_full_name: str
    status: str
    opened_by: str
    reviewer: str
    regulations: List[str]
    files: List[RemediationDraft]
    github_pr_url: str | None = None
    opened_at: str
    updated_at: str


class PRsResponse(BaseModel):
    pull_requests: List[PullRequest]


class OpenPRResponse(BaseModel):
    pull_request: PullRequest
