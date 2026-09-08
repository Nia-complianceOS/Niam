"""
What this account has scanned, and how to remove it.

Separate from /github/repos, which lists repositories on GitHub. These
routes are about repositories this account has already scanned INTO the
graph -- a different set, with a different lifecycle, and the one a user
means when they say "I scanned the wrong repo, get rid of it".
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import require_auth
from app.services import workspace_service

router = APIRouter()


class ScannedRepository(BaseModel):
    system_name: str
    repo: str
    data_types: int
    vendors: int
    gaps: int
    # None when the repository was written by a CLI run rather than a
    # scan through the API. Not an error -- it is how the fixtures load.
    last_scan: str | None = None


class ScannedRepositoriesResponse(BaseModel):
    repositories: list[ScannedRepository]


class RemovalResponse(BaseModel):
    repo: str | None = None
    system_name: str | None = None
    removed: dict
    reset_at: str | None = None


@router.get("/repositories", response_model=ScannedRepositoriesResponse)
def scanned_repositories(user_id: str = Depends(require_auth)):
    return ScannedRepositoriesResponse(
        repositories=workspace_service.list_scanned_repositories(user_id)
    )


@router.delete("/repositories/{system_name}", response_model=RemovalResponse)
def remove_repository(system_name: str, user_id: str = Depends(require_auth)):
    """Remove one scanned repository's findings from this account.

    Its :System, gaps, drafts, pull-request records, scan history and
    policy documents go. Data types and vendors go only if no OTHER
    repository on this account still reaches them -- two repositories that
    both send email to Stripe share one :Vendor node, and removing one
    must not take the other's vendor with it.
    """
    return RemovalResponse(
        **workspace_service.delete_repository(user_id, system_name)
    )


@router.post("/reset", response_model=RemovalResponse)
def reset(user_id: str = Depends(require_auth)):
    """Delete every finding on this account and start over.

    The account and any GitHub connection survive: this is "start over",
    not "close my account". POST rather than DELETE because it acts on the
    whole workspace rather than one addressable resource.
    """
    return RemovalResponse(**workspace_service.reset_account_data(user_id))
