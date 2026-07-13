"""
GET /api/v1/github/repos — Repositories page
GET /api/v1/github/prs — Pull Requests page

Note: this is the *read* surface over GitHub-sourced data. The write
path (opening a PR) lives on POST /api/v1/gaps/{id}/open-pr in
gaps.py, since a PR is always created from a specific gap. The
inbound webhook receiver lives separately in webhook.py.
"""

from fastapi import APIRouter

from app.schemas.prs import PRsResponse
from app.schemas.repos import ReposResponse
from app.services import github_service

router = APIRouter()


@router.get("/repos", response_model=ReposResponse)
def repos():
    return github_service.list_repositories()


@router.get("/prs", response_model=PRsResponse)
def pull_requests():
    return github_service.list_pull_requests()