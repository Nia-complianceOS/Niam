"""
GET    /api/v1/team                         — workspace, members, my role
PATCH  /api/v1/team                         — rename / settings (owner)
POST   /api/v1/team/invites                 — create an invite link (owner)
GET    /api/v1/team/invites                 — recent invites (owner)
DELETE /api/v1/team/invites/{id}            — revoke (owner)
PATCH  /api/v1/team/members/{user_id}       — change role (owner)
DELETE /api/v1/team/members/{user_id}       — remove (owner), or leave (self)

GET    /api/v1/invites/{token}              — preview (public)
POST   /api/v1/invites/{token}/accept       — join (signed in)

Invite links are copyable URLs, not emails: no mail provider to add,
secure or pay for. The raw token appears once, in the create response.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import (
    ROLE_OWNER,
    Workspace,
    clear_membership_cache,
    current_workspace,
    require_auth,
    require_role,
)
from app.services import membership_service

router = APIRouter()
invites_router = APIRouter()


class TeamPatch(BaseModel):
    name: str | None = None
    require_distinct_approvers: bool | None = None


class InviteCreate(BaseModel):
    role: str = "legal"


class RoleChange(BaseModel):
    role: str


@router.get("")
def team(ws: Workspace = Depends(current_workspace)):
    return {
        "workspace": membership_service.get_workspace(ws.workspace_id),
        "members": membership_service.list_members(ws.workspace_id),
        "my_role": ws.role,
        "my_user_id": ws.user_id,
    }


@router.patch("")
def patch_team(body: TeamPatch, ws: Workspace = Depends(require_role(ROLE_OWNER))):
    return membership_service.update_settings(
        ws.workspace_id, body.name, body.require_distinct_approvers
    )


@router.post("/invites")
def create_invite(body: InviteCreate, ws: Workspace = Depends(require_role(ROLE_OWNER))):
    return membership_service.create_invite(ws.workspace_id, ws.user_id, body.role)


@router.get("/invites")
def list_invites(ws: Workspace = Depends(require_role(ROLE_OWNER))):
    return {"invites": membership_service.list_invites(ws.workspace_id)}


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, ws: Workspace = Depends(require_role(ROLE_OWNER))):
    membership_service.revoke_invite(ws.workspace_id, invite_id)


@router.patch("/members/{user_id}", status_code=204)
def change_role(user_id: str, body: RoleChange, ws: Workspace = Depends(require_role(ROLE_OWNER))):
    membership_service.change_role(ws.workspace_id, user_id, body.role)
    clear_membership_cache()


@router.delete("/members/{user_id}", status_code=204)
def remove_member(user_id: str, ws: Workspace = Depends(current_workspace)):
    if user_id != ws.user_id and ws.role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Only an owner can remove other members.")
    membership_service.remove_member(ws.workspace_id, user_id)
    clear_membership_cache()


@invites_router.get("/{token}")
def preview(token: str):
    return membership_service.preview_invite(token)


@invites_router.post("/{token}/accept")
def accept(token: str, user_id: str = Depends(require_auth)):
    return membership_service.accept_invite(token, user_id)
