"""Sign in with GitHub and the browser-bound OAuth completion.

The properties that matter:
  - a flow can only be finished in the browser that started it
  - a connect flow can only be finished by the user who started it
  - a GitHub email matching an existing password account is never linked
    automatically, and an unverified email is never used at all
  - a new GitHub user arrives with a workspace AND a repository connection
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.services import (
    audit_service,
    github_identity,
    github_signin,
    membership_service,
    user_service,
)
from tests.fake_supabase import FakeSupabase

VERIFIER = "correct-horse-battery-staple-verifier-0123456789abcdef"
BINDING = github_signin.sha256_hex(VERIFIER)


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase()
    for mod in (github_signin, github_identity, user_service, membership_service, audit_service):
        monkeypatch.setattr(mod, "get_supabase", lambda f=fake: f)
    return fake


def _park(purpose="login", user_id=None, email="new@dev.test", verified=True, gh_id="4242"):
    return github_signin.park_completion(
        {"purpose": purpose, "browser_binding": BINDING, "user_id": user_id},
        token="gho_exampletoken",
        identity={"id": gh_id, "login": "octo", "name": "Octo Cat", "avatar_url": ""},
        email=email,
        email_verified=verified,
        scopes=["repo", "read:user", "user:email"],
    )


def test_binding_must_be_a_sha256_hex():
    assert github_signin.valid_binding(BINDING)
    assert not github_signin.valid_binding("abc")
    assert not github_signin.valid_binding(None)


def test_completion_code_is_stored_hashed_and_token_encrypted(db):
    code = _park()
    row = db.tables["oauth_completions"][0]
    assert row["code_hash"] == github_signin.sha256_hex(code)
    assert code not in str(row)
    assert "gho_exampletoken" not in str(row)


def test_wrong_browser_is_refused(db):
    code = _park()
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.redeem(code, "some-other-verifier", "login")
    assert e.value.reason == "browser_mismatch"


def test_code_is_single_use(db):
    code = _park()
    github_signin.redeem(code, VERIFIER, "login")
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.redeem(code, VERIFIER, "login")
    assert e.value.reason == "expired_code"


def test_expired_code_is_refused(db):
    code = _park()
    db.tables["oauth_completions"][0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    ).isoformat()
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.redeem(code, VERIFIER, "login")
    assert e.value.reason == "expired_code"


def test_purpose_cannot_be_swapped(db):
    code = _park(purpose="connect", user_id="u1")
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.redeem(code, VERIFIER, "login")
    assert e.value.reason == "invalid_state"


def test_connect_must_be_finished_by_the_user_who_started_it(db):
    code = _park(purpose="connect", user_id="alice")
    row = github_signin.redeem(code, VERIFIER, "connect")
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.finish_connect(row, acting_user_id="mallory", workspace_id="mallory")
    assert e.value.reason == "invalid_state"
    assert not db.tables.get("github_connections")


def test_connect_stores_connection_and_links_identity(db):
    code = _park(purpose="connect", user_id="alice")
    row = github_signin.redeem(code, VERIFIER, "connect")
    out = github_signin.finish_connect(row, "alice", "alice")
    assert out["linked_for_signin"] is True
    assert db.tables["github_connections"][0]["user_id"] == "alice"
    assert db.tables["user_identities"][0]["user_id"] == "alice"


def test_new_github_user_gets_account_workspace_and_connection(db):
    row = github_signin.redeem(_park(), VERIFIER, "login")
    user, created = github_signin.finish_login(row)
    assert created and user.email == "new@dev.test" and user.hashed_password is None
    assert db.tables["workspace_members"][0] == {
        **db.tables["workspace_members"][0],
        "workspace_id": user.id,
        "user_id": user.id,
        "role": "owner",
    }
    assert db.tables["github_connections"][0]["user_id"] == user.id  # never connect again
    assert db.tables["user_identities"][0]["provider_user_id"] == "4242"


def test_returning_github_user_signs_in(db):
    first, _ = github_signin.finish_login(github_signin.redeem(_park(), VERIFIER, "login"))
    again, created = github_signin.finish_login(github_signin.redeem(_park(), VERIFIER, "login"))
    assert not created and again.id == first.id


def test_existing_password_account_is_not_auto_linked(db):
    db.tables["users"] = [
        {"id": "pw-user", "email": "taken@dev.test", "hashed_password": "h", "name": "P"}
    ]
    row = github_signin.redeem(_park(email="taken@dev.test"), VERIFIER, "login")
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.finish_login(row)
    assert e.value.reason == "account_exists_link_required"
    assert not db.tables.get("user_identities")
    assert not db.tables.get("github_connections")


def test_unverified_email_is_never_used(db):
    row = github_signin.redeem(_park(verified=False), VERIFIER, "login")
    with pytest.raises(github_signin.FlowError) as e:
        github_signin.finish_login(row)
    assert e.value.reason == "email_unverified"


def test_identity_is_keyed_on_github_id_not_login(db):
    user, _ = github_signin.finish_login(github_signin.redeem(_park(), VERIFIER, "login"))
    # Same GitHub account after a rename: new login, same numeric id.
    code = github_signin.park_completion(
        {"purpose": "login", "browser_binding": BINDING, "user_id": None},
        token="gho_x",
        identity={"id": "4242", "login": "octo-renamed", "name": None, "avatar_url": ""},
        email="new@dev.test",
        email_verified=True,
        scopes=[],
    )
    again, created = github_signin.finish_login(github_signin.redeem(code, VERIFIER, "login"))
    assert again.id == user.id and not created


# --- the query-string SSE ticket is only good for the progress stream ----


def test_sse_ticket_is_not_accepted_outside_the_event_stream():
    from app.core import auth
    from app.main import app

    ticket = auth.create_sse_token("someone")
    client = TestClient(app)
    r = client.post(f"/api/v1/workspace/reset?token={ticket}")
    assert r.status_code == 401
