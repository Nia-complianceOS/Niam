"""The two-stage approval workflow: transition table, full flows,
concurrency, role checks and the advisory edit analysis."""

import itertools

import pytest
from fastapi import HTTPException

from app.api.deps import ROLE_LEGAL, ROLE_MEMBER, ROLE_OWNER, Workspace
from app.schemas.gaps import Gap, RemediationDraft
from app.schemas.prs import PullRequest
from app.services import (
    audit_service,
    gap_service,
    github_service,
    membership_service,
    review_service,
    user_service,
)
from tests.fake_supabase import FakeSupabase

OWNER = "11111111-1111-1111-1111-111111111111"
LAWYER = "22222222-2222-2222-2222-222222222222"
MEMBER = "33333333-3333-3333-3333-333333333333"
WS = OWNER

ALL_STATES = [
    review_service.IN_LEGAL_REVIEW,
    review_service.LEGAL_APPROVED,
    review_service.OWNER_APPROVED,
    review_service.PR_OPENED,
    review_service.PENDING_OWNER_ACK,
    review_service.DISMISSED,
    review_service.RISK_ACCEPTED,
]
ALL_ROLES = [ROLE_OWNER, ROLE_LEGAL, ROLE_MEMBER]


def test_transition_table_is_exhaustive():
    """Every state x action x role is either the allowed transition or a
    refusal -- never an accident."""
    for state, action, role in itertools.product(ALL_STATES, review_service.ACTIONS, ALL_ROLES):
        expected = review_service.TRANSITIONS.get((state, action))
        if expected is None:
            with pytest.raises(HTTPException) as e:
                review_service.check_transition(state, action, role)
            assert e.value.status_code == 409
        elif role not in expected.roles:
            with pytest.raises(HTTPException) as e:
                review_service.check_transition(state, action, role)
            assert e.value.status_code == 403
        else:
            assert review_service.check_transition(state, action, role) is expected


def test_final_states_accept_no_action():
    for state in review_service.FINAL_STATES:
        assert not [a for (s, a) in review_service.TRANSITIONS if s == state]


def test_members_never_approve():
    for (state, action), t in review_service.TRANSITIONS.items():
        assert ROLE_MEMBER not in t.roles, (state, action)


def test_only_owner_gives_final_approval():
    t = review_service.TRANSITIONS[(review_service.LEGAL_APPROVED, "owner_approve")]
    assert t.roles == (ROLE_OWNER,)


# --- flows against an in-memory Supabase ---------------------------------


def _gap(**kw):
    base = dict(
        id=f"gap-{WS}-acme__web-disclosure-email-Mixpanel",
        title="Email shared with Mixpanel without disclosure",
        status="fix_generated",
        kind="undisclosed_sharing",
        vendor="Mixpanel",
        data_types=["email"],
        regulations=["DPDP-5"],
        remediation_drafts=[
            RemediationDraft(
                document="Third-party sharing",
                summary="Names Mixpanel",
                file_path="PRIVACY.md",
                diff_text="## Analytics\nWe share your email with Mixpanel to measure product usage.",
            )
        ],
    )
    base.update(kw)
    return Gap(**base)


@pytest.fixture
def env(monkeypatch):
    db = FakeSupabase()
    for mod in (review_service, membership_service, user_service, audit_service):
        monkeypatch.setattr(mod, "get_supabase", lambda db=db: db)
    db.tables["users"] = [
        {"id": OWNER, "email": "owner@acme.test", "name": "Olivia Owner", "hashed_password": "x"},
        {"id": LAWYER, "email": "legal@acme.test", "name": "Lakshmi Legal", "hashed_password": "x"},
        {"id": MEMBER, "email": "dev@acme.test", "name": "Dev", "hashed_password": "x"},
    ]
    db.tables["workspaces"] = [{"id": WS, "name": "Acme", "settings": {}}]

    gap = _gap()
    mirrored = []
    opened = []
    monkeypatch.setattr(gap_service, "get_gap", lambda owner, gid: gap)
    monkeypatch.setattr(gap_service, "set_gap_status", lambda o, g, s: mirrored.append(s))
    monkeypatch.setattr(gap_service, "mark_pr_opened", lambda o, g, p: None)

    def fake_open(owner_id, g, drafts=None, approval=None):
        opened.append({"owner": owner_id, "drafts": drafts, "approval": approval})
        return PullRequest(
            id=f"pr-{owner_id}-acme__web-7",
            gap_id=g.id,
            title="t",
            repo_full_name="acme/web",
            status="ready_for_review",
            opened_by="olivia",
            reviewer="Legal Team",
            regulations=[],
            files=drafts or [],
            github_pr_url="https://github.com/acme/web/pull/7",
            opened_at="now",
            updated_at="now",
        )

    monkeypatch.setattr(github_service, "open_compliance_pr", fake_open)
    return {"db": db, "gap": gap, "mirrored": mirrored, "opened": opened}


owner = Workspace(user_id=OWNER, workspace_id=WS, role=ROLE_OWNER)
lawyer = Workspace(user_id=LAWYER, workspace_id=WS, role=ROLE_LEGAL)
member = Workspace(user_id=MEMBER, workspace_id=WS, role=ROLE_MEMBER)


def _act(ws, rid, action, **kw):
    cur = review_service.get_review_detail(WS, rid)
    return review_service.act(ws, rid, action, cur["updated_at"], **kw)


def test_full_two_person_flow_opens_pr_with_the_approved_version(env):
    r = review_service.start_review(member, env["gap"])
    assert r["state"] == "in_legal_review"
    assert env["mirrored"][-1] == "in_review"

    edited = "## Analytics\nWe share your email address with Mixpanel, our analytics provider."
    d = _act(lawyer, r["id"], "edit", documents=[{"body": edited}], comment="plainer")
    assert len(d["versions"]) == 2 and d["versions"][1]["author_kind"] == "human"
    assert d["versions"][1]["documents"][0]["file_path"] == "PRIVACY.md"

    d = _act(lawyer, r["id"], "approve")
    assert d["state"] == "legal_approved"
    assert d["approvals"]["legal"]["version_no"] == 2

    d = _act(owner, r["id"], "owner_approve")
    assert d["state"] == "pr_opened"
    assert d["pr_url"].endswith("/pull/7")
    assert not d["self_approved"]

    sent = env["opened"][-1]
    assert sent["drafts"][0].diff_text == edited  # the approved text, not the AI draft
    assert sent["approval"]["legal"]["by"] == "Lakshmi Legal"
    assert sent["approval"]["owner"]["by"] == "Olivia Owner"
    actions = [e["action"] for e in d["events"]]
    assert actions == ["submitted", "edit", "approve", "owner_approve", "pr_opened"]


def test_start_review_is_idempotent(env):
    a = review_service.start_review(owner, env["gap"])
    b = review_service.start_review(owner, env["gap"])
    assert a["id"] == b["id"]


def test_stale_update_is_refused(env):
    r = review_service.start_review(owner, env["gap"])
    seen = review_service.get_review_detail(WS, r["id"])["updated_at"]
    review_service.act(lawyer, r["id"], "approve", seen)
    with pytest.raises(HTTPException) as e:
        review_service.act(owner, r["id"], "send_back", seen)
    assert e.value.status_code == 409


def test_member_cannot_approve(env):
    r = review_service.start_review(owner, env["gap"])
    with pytest.raises(HTTPException) as e:
        _act(member, r["id"], "approve")
    assert e.value.status_code == 403


def test_legal_cannot_give_owner_approval(env):
    r = review_service.start_review(owner, env["gap"])
    _act(lawyer, r["id"], "approve")
    with pytest.raises(HTTPException) as e:
        _act(lawyer, r["id"], "owner_approve")
    assert e.value.status_code == 403


def test_solo_owner_can_do_both_and_is_labelled(env):
    r = review_service.start_review(owner, env["gap"])
    _act(owner, r["id"], "approve")
    d = _act(owner, r["id"], "owner_approve")
    assert d["state"] == "pr_opened" and d["self_approved"]
    assert env["opened"][-1]["approval"]["self_approved"] is True


def test_distinct_approvers_setting_is_enforced(env):
    env["db"].tables["workspaces"][0]["settings"] = {"require_distinct_approvers": True}
    r = review_service.start_review(owner, env["gap"])
    _act(owner, r["id"], "approve")
    with pytest.raises(HTTPException) as e:
        _act(owner, r["id"], "owner_approve")
    assert e.value.status_code == 409


def test_send_back_clears_approvals(env):
    r = review_service.start_review(owner, env["gap"])
    _act(lawyer, r["id"], "approve")
    d = _act(owner, r["id"], "send_back", comment="name the purpose")
    assert d["state"] == "in_legal_review" and d["approvals"] == {}


def test_not_required_needs_owner_confirmation(env):
    r = review_service.start_review(owner, env["gap"])
    with pytest.raises(HTTPException):
        _act(lawyer, r["id"], "not_required", outcome="dismissed")  # no reason
    d = _act(lawyer, r["id"], "not_required", outcome="dismissed", comment="Mixpanel is self-hosted here")
    assert d["state"] == "pending_owner_ack"
    d = _act(owner, r["id"], "confirm")
    assert d["state"] == "dismissed"
    assert env["mirrored"][-1] == "dismissed"


def test_risk_accepted_requires_review_date(env):
    r = review_service.start_review(owner, env["gap"])
    with pytest.raises(HTTPException) as e:
        _act(lawyer, r["id"], "not_required", outcome="risk_accepted", comment="accepted")
    assert e.value.status_code == 422


def test_pr_failure_keeps_owner_approved_with_reason(env, monkeypatch):
    def refuse(*a, **k):
        raise HTTPException(status_code=403, detail="Refusing: not in PR_ALLOWED_REPOS")

    monkeypatch.setattr(github_service, "open_compliance_pr", refuse)
    r = review_service.start_review(owner, env["gap"])
    _act(lawyer, r["id"], "approve")
    d = _act(owner, r["id"], "owner_approve")
    assert d["state"] == "owner_approved"
    assert "PR_ALLOWED_REPOS" in d["last_error"]


def test_send_back_from_owner_approved_recovers_a_failed_pr(env, monkeypatch):
    """A PR that fails for a reason "retry" can't fix (the draft itself is
    wrong, e.g. no file_path) must not leave the review stuck retrying the
    same failure forever."""

    def refuse(*a, **k):
        raise HTTPException(status_code=400, detail="Gap has no document to amend")

    monkeypatch.setattr(github_service, "open_compliance_pr", refuse)
    r = review_service.start_review(owner, env["gap"])
    _act(lawyer, r["id"], "approve")
    d = _act(owner, r["id"], "owner_approve")
    assert d["state"] == "owner_approved" and "no document to amend" in d["last_error"]

    d = _act(owner, r["id"], "send_back", comment="needs a policy document linked first")
    assert d["state"] == "in_legal_review"
    assert d["approvals"] == {}
    assert d["last_error"] is None

    # Legal fixes it (in reality: reconcile again, then redo/edit) and the
    # normal flow completes.
    def fixed(owner_id, g, drafts=None, approval=None):
        env["opened"].append({"owner": owner_id, "drafts": drafts, "approval": approval})
        return PullRequest(
            id="pr-recovered",
            gap_id=g.id,
            title="t",
            repo_full_name="acme/web",
            status="ready_for_review",
            opened_by="olivia",
            reviewer="Legal Team",
            regulations=[],
            files=drafts or [],
            github_pr_url="https://github.com/acme/web/pull/8",
            opened_at="now",
            updated_at="now",
        )

    monkeypatch.setattr(github_service, "open_compliance_pr", fixed)
    _act(lawyer, r["id"], "approve")
    d = _act(owner, r["id"], "owner_approve")
    assert d["state"] == "pr_opened"


def test_member_cannot_send_back_from_owner_approved(env, monkeypatch):
    def refuse(*a, **k):
        raise HTTPException(status_code=400, detail="broken draft")

    monkeypatch.setattr(github_service, "open_compliance_pr", refuse)
    r = review_service.start_review(owner, env["gap"])
    _act(lawyer, r["id"], "approve")
    _act(owner, r["id"], "owner_approve")  # stays owner_approved, PR failed
    with pytest.raises(HTTPException) as e:
        _act(member, r["id"], "send_back")
    assert e.value.status_code == 403


def test_direct_open_pr_requires_owner_approval(env):
    review_service.start_review(owner, env["gap"])
    with pytest.raises(HTTPException) as e:
        review_service.open_pr_for_gap(owner, env["gap"].id)
    assert e.value.status_code == 409


def test_display_status_follows_review(env):
    r = review_service.start_review(owner, env["gap"])
    out = review_service.apply_to_gaps(WS, [env["gap"]])[0]
    assert out.status == "in_review" and out.review_id == r["id"]


# --- advisory analysis ------------------------------------------------------


def test_analysis_flags_dropped_vendor_and_new_promises():
    gap = _gap()
    prev = [{"body": "We share your email with Mixpanel."}]
    edited = [{"body": "We share your email with analytics partners and delete it after 30 days. Data is encrypted."}]
    w = review_service.analyse_edit(gap, prev, edited)["warnings"]
    assert any("Mixpanel" in x for x in w)
    assert any("retention" in x for x in w)
    assert any("security" in x for x in w)


def test_analysis_quiet_for_a_faithful_edit():
    gap = _gap()
    prev = [{"body": "We share your email with Mixpanel."}]
    edited = [{"body": "We share your email address with Mixpanel, our analytics provider."}]
    assert review_service.analyse_edit(gap, prev, edited)["warnings"] == []
