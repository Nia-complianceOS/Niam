"""
GET  /api/v1/reviews                 — this workspace's reviews (?state=)
GET  /api/v1/reviews/counts          — {legal, owner} waiting counts, for badges
GET  /api/v1/reviews/{id}            — one review: versions, events, approvals
POST /api/v1/reviews/{id}/actions    — edit | redo | approve | not_required |
                                       owner_approve | send_back | confirm |
                                       reject | open_pr

Every action carries `expected_updated_at`, the review's updated_at as the
caller last saw it. If someone else acted in between, the action is
refused with 409 rather than silently applied on top.
Role checks live in review_service.TRANSITIONS.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import Workspace, current_workspace, require_owner_id
from app.services import review_service

router = APIRouter()


class DocumentEdit(BaseModel):
    title: str | None = None
    summary: str | None = None
    body: str = Field(max_length=20000)


class ReviewAction(BaseModel):
    action: str
    expected_updated_at: str
    comment: str | None = Field(default=None, max_length=4000)
    documents: list[DocumentEdit] | None = None
    instructions: str | None = Field(default=None, max_length=2000)
    outcome: str | None = None
    review_by: date | None = None


@router.get("")
def list_reviews(
    state: str | None = Query(default=None),
    owner_id: str = Depends(require_owner_id),
):
    return {"reviews": review_service.list_reviews(owner_id, state)}


@router.get("/counts")
def counts(owner_id: str = Depends(require_owner_id)):
    return review_service.queue_counts(owner_id)


@router.get("/{review_id}")
def get_review(review_id: str, owner_id: str = Depends(require_owner_id)):
    return review_service.get_review_detail(owner_id, review_id)


@router.post("/{review_id}/actions")
def act(
    review_id: str,
    body: ReviewAction,
    ws: Workspace = Depends(current_workspace),
):
    return review_service.act(
        ws,
        review_id,
        body.action,
        body.expected_updated_at,
        comment=body.comment,
        documents=[d.model_dump() for d in body.documents] if body.documents else None,
        instructions=body.instructions,
        outcome=body.outcome,
        review_by=body.review_by,
    )
