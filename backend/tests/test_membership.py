"""Workspaces, invite links and workspace resolution."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.api import deps
from app.services import membership_service
from tests.fake_supabase import FakeSupabase

OWNER = "owner-1"
LAWYER = "lawyer-1"
STRANGER = "stranger-1"


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(membership_service, "get_supabase", lambda: fake)
    deps.clear_membership_cache()
    fake.tables["users"] = [
        {"id": OWNER, "email": "o@x.test", "name": "O"},
        {"id": LAWYER, "email": "l@x.test", "name": "L"},
    ]
    membership_service.create_personal_workspace(OWNER, "O", "o@x.test")
    membership_service.create_personal_workspace(LAWYER, "L", "l@x.test")
    return fake


def test_personal_workspace_is_the_user_id(db):
    ws = membership_service.resolve_workspace(OWNER, None)
    assert ws.workspace_id == OWNER and ws.role == "owner"


def test_invite_is_single_use_and_stored_hashed(db):
    inv = membership_service.create_invite(OWNER, OWNER, "legal")
    assert inv["token"] not in str(db.tables["workspace_invites"])
    assert membership_service.preview_invite(inv["token"])["role"] == "legal"

    joined = membership_service.accept_invite(inv["token"], LAWYER)
    assert joined["workspace_id"] == OWNER and joined["role"] == "legal"
    with pytest.raises(HTTPException) as e:
        membership_service.accept_invite(inv["token"], STRANGER)
    assert e.value.status_code == 404


def test_expired_invite_is_refused(db):
    inv = membership_service.create_invite(OWNER, OWNER, "legal")
    db.tables["workspace_invites"][0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    ).isoformat()
    with pytest.raises(HTTPException):
        membership_service.accept_invite(inv["token"], LAWYER)


def test_member_resolves_into_the_other_workspace_with_their_role(db):
    inv = membership_service.create_invite(OWNER, OWNER, "legal")
    membership_service.accept_invite(inv["token"], LAWYER)
    ws = membership_service.resolve_workspace(LAWYER, OWNER)
    assert ws.workspace_id == OWNER and ws.role == "legal"
    # Their own workspace is still the default.
    assert membership_service.resolve_workspace(LAWYER, None).workspace_id == LAWYER


def test_non_member_cannot_select_a_workspace(db):
    assert membership_service.resolve_workspace(STRANGER, OWNER) is None
    with pytest.raises(HTTPException) as e:
        deps._resolve(STRANGER, OWNER)
    assert e.value.status_code == 403


def test_creator_stays_owner(db):
    with pytest.raises(HTTPException):
        membership_service.change_role(OWNER, OWNER, "legal")
    with pytest.raises(HTTPException):
        membership_service.remove_member(OWNER, OWNER)
