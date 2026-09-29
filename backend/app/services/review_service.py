"""
The two-stage approval workflow (migration 006).

    generate fix ─▶ in_legal_review ──legal: approve──▶ legal_approved
                      │  ▲  (edit / AI redo keep it here)       │
                      │  └──────────── owner: send back ◀──────┤
                      │                                         ▼
                      │                              owner: approve ─▶ owner_approved ─▶ pr_opened
                      │                                                (PR opened with the approved version)
                      └─legal: not required─▶ pending_owner_ack ─owner: confirm─▶ dismissed | risk_accepted
                                                    └─owner: reject─▶ in_legal_review

"Applied" means the pull request is opened. Review happens here, in the
app, where legal works on versions; the pull request is the OUTPUT of
approval, and it carries the approval record in its body. Merging stays
with the repository's own process on GitHub.

Every action is checked against TRANSITIONS -- (state, action) -> allowed
roles and next state -- rather than scattered `if`s, and every transition
is an optimistic update (`... WHERE updated_at = <what the caller saw>`),
so two people approving at once gives one winner and one clear message.
Versions and events are append-only.

A solo founder holds both roles. The owner may therefore act at the legal
stage; that is recorded, and a review approved at both stages by one
person is labelled "self-approved". A workspace can forbid it with the
`require_distinct_approvers` setting.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone

from fastapi import HTTPException

from app.api.deps import ROLE_LEGAL, ROLE_MEMBER, ROLE_OWNER, Workspace
from app.db.supabase import get_supabase
from app.schemas.gaps import Gap, RemediationDraft
from app.services import audit_service, membership_service, user_service

logger = logging.getLogger("niam.review")

# States -----------------------------------------------------------------
IN_LEGAL_REVIEW = "in_legal_review"
LEGAL_APPROVED = "legal_approved"
OWNER_APPROVED = "owner_approved"
PR_OPENED = "pr_opened"
PENDING_OWNER_ACK = "pending_owner_ack"
DISMISSED = "dismissed"
RISK_ACCEPTED = "risk_accepted"

LIVE_STATES = (IN_LEGAL_REVIEW, LEGAL_APPROVED, OWNER_APPROVED, PENDING_OWNER_ACK)
FINAL_STATES = (PR_OPENED, DISMISSED, RISK_ACCEPTED)

# Who may act at the legal stage. The owner is included so a one-person
# workspace can use the product; see the module docstring.
LEGAL_ROLES = (ROLE_LEGAL, ROLE_OWNER)
OWNER_ROLES = (ROLE_OWNER,)


@dataclass(frozen=True)
class Transition:
    roles: tuple[str, ...]
    next_state: str | None  # None = decided by the action (confirm)


TRANSITIONS: dict[tuple[str, str], Transition] = {
    (IN_LEGAL_REVIEW, "edit"): Transition(LEGAL_ROLES, IN_LEGAL_REVIEW),
    (IN_LEGAL_REVIEW, "redo"): Transition(LEGAL_ROLES, IN_LEGAL_REVIEW),
    (IN_LEGAL_REVIEW, "approve"): Transition(LEGAL_ROLES, LEGAL_APPROVED),
    (IN_LEGAL_REVIEW, "not_required"): Transition(LEGAL_ROLES, PENDING_OWNER_ACK),
    (LEGAL_APPROVED, "owner_approve"): Transition(OWNER_ROLES, OWNER_APPROVED),
    (LEGAL_APPROVED, "send_back"): Transition(OWNER_ROLES, IN_LEGAL_REVIEW),
    (OWNER_APPROVED, "open_pr"): Transition(OWNER_ROLES, PR_OPENED),
    # A PR can fail to open for a reason "retry" can't fix -- the draft
    # itself needs a different file to amend, say (see last_error). Without
    # this, a review whose PR fails is stuck retrying the same failure
    # forever: nothing else in OWNER_APPROVED can change the draft.
    (OWNER_APPROVED, "send_back"): Transition(OWNER_ROLES, IN_LEGAL_REVIEW),
    (PENDING_OWNER_ACK, "confirm"): Transition(OWNER_ROLES, None),
    (PENDING_OWNER_ACK, "reject"): Transition(OWNER_ROLES, IN_LEGAL_REVIEW),
}

ACTIONS = sorted({a for (_, a) in TRANSITIONS})

# How each review state shows on the finding itself.
GAP_STATUS_FOR_STATE = {
    IN_LEGAL_REVIEW: "in_review",
    LEGAL_APPROVED: "in_review",
    OWNER_APPROVED: "in_review",
    PENDING_OWNER_ACK: "in_review",
    PR_OPENED: "pr_opened",
    DISMISSED: "dismissed",
    RISK_ACCEPTED: "risk_accepted",
}


def check_transition(state: str, action: str, role: str) -> Transition:
    """The table lookup every action goes through. Raises 409 for an
    action that does not apply in this state, 403 for the wrong role."""
    t = TRANSITIONS.get((state, action))
    if t is None:
        raise HTTPException(
            status_code=409,
            detail=f"'{action}' is not possible while the review is {state.replace('_', ' ')}.",
        )
    if role not in t.roles:
        raise HTTPException(
            status_code=403,
            detail=f"Your role ({role}) cannot '{action}' at this stage.",
        )
    return t


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows(resp) -> list[dict]:
    data = getattr(resp, "data", None) if resp is not None else None
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def _actor(ws: Workspace) -> str:
    u = user_service.get_user_by_id(ws.user_id)
    if u is None:
        return "unknown"
    return u.name or u.email


# --- versions -------------------------------------------------------------


def documents_from_drafts(drafts: list[RemediationDraft]) -> list[dict]:
    return [
        {
            "file_path": d.file_path,
            "title": d.document,
            "summary": d.summary,
            "body": d.diff_text or "",
        }
        for d in drafts
    ]


def drafts_from_documents(documents: list[dict]) -> list[RemediationDraft]:
    return [
        RemediationDraft(
            document=d.get("title") or "Amendment",
            summary=d.get("summary") or "",
            file_path=d.get("file_path"),
            diff_text=d.get("body") or "",
        )
        for d in documents or []
    ]


_RETENTION = re.compile(
    r"\b\d+\s*(day|days|month|months|year|years)\b|\bretain(ed|s)?\b|\bdelete[ds]? (after|within)\b",
    re.I,
)
_SECURITY = re.compile(
    r"\b(encrypt\w*|ISO\s*27001|SOC\s*2|penetration test\w*|AES|TLS)\b", re.I
)
_SECTION = re.compile(r"(?:section|sec\.|§)\s*(\d+)(?:\s*\(\s*(\d+)\s*\))?", re.I)


def analyse_edit(gap: Gap, previous: list[dict], edited: list[dict]) -> dict:
    """Advisory checks on a lawyer's edit. Never blocks: legal has the
    authority, and the UI shows these as warnings next to the version.

    - Did the edit drop what this finding requires (the recipient's name,
      for undisclosed sharing; the data category)?
    - Does it now promise things nothing in the evidence supports
      (retention periods, security measures)? The AI drafter is told not
      to; a human edit can.
    - Does it cite sections of the Act the finding is not about?
    """
    warnings: list[str] = []
    old_text = " ".join((d.get("body") or "") for d in previous)
    new_text = " ".join((d.get("body") or "") for d in edited)
    low = new_text.lower()

    if not new_text.strip():
        warnings.append("The edited amendment is empty.")
    if gap.kind == "undisclosed_sharing" and gap.vendor and gap.vendor.lower() not in low:
        warnings.append(
            f"The finding is that data goes to {gap.vendor} without disclosure, "
            f"but the edited text no longer names {gap.vendor}."
        )
    for dt in gap.data_types:
        words = dt.replace("_", " ").lower()
        if words not in low and dt.lower() not in low and dt.split("_")[0] not in low:
            warnings.append(
                f"The edited text does not mention the data category '{words}' this finding is about."
            )
    if _RETENTION.search(new_text) and not _RETENTION.search(old_text):
        warnings.append(
            "The edit adds a retention commitment. Nothing in the scan evidences how long this data is kept; confirm it is true before approving."
        )
    if _SECURITY.search(new_text) and not _SECURITY.search(old_text):
        warnings.append(
            "The edit adds a security claim. Nothing in the scan evidences it; confirm it is true before approving."
        )
    cited = {m.group(1) for m in _SECTION.finditer(new_text)}
    expected = set()
    for r in gap.regulations:
        m = re.search(r"(\d+)", str(r))
        if m:
            expected.add(m.group(1))
    stray = sorted(cited - expected, key=int) if expected else []
    if stray:
        warnings.append(
            "Cites section(s) "
            + ", ".join(stray)
            + " of the Act, which this finding is not linked to. Check the citation."
        )
    return {"warnings": warnings, "checked_at": _now()}


# --- reads ----------------------------------------------------------------


def _get_review(workspace_id: str, review_id: str) -> dict:
    try:
        rows = _rows(
            get_supabase()
            .table("remediation_reviews")
            .select("*")
            .eq("id", review_id)
            .eq("workspace_id", workspace_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read the review: {exc}")
    if not rows:
        raise HTTPException(status_code=404, detail="Review not found")
    return rows[0]


def _versions(workspace_id: str, review_id: str) -> list[dict]:
    return _rows(
        get_supabase()
        .table("draft_versions")
        .select("*")
        .eq("review_id", review_id)
        .eq("workspace_id", workspace_id)
        .order("version_no")
        .execute()
    )


def _events(workspace_id: str, review_id: str) -> list[dict]:
    return _rows(
        get_supabase()
        .table("review_events")
        .select("*")
        .eq("review_id", review_id)
        .eq("workspace_id", workspace_id)
        .order("at")
        .execute()
    )


def _self_approved(review: dict) -> bool:
    ap = review.get("approvals") or {}
    legal = (ap.get("legal") or {}).get("user_id")
    owner = (ap.get("owner") or {}).get("user_id")
    return bool(legal and owner and legal == owner)


def _summary(review: dict) -> dict:
    return {
        "id": review["id"],
        "gap_id": review["gap_id"],
        "gap_title": review.get("gap_title"),
        "state": review["state"],
        "approvals": review.get("approvals") or {},
        "self_approved": _self_approved(review),
        "proposed_outcome": review.get("proposed_outcome"),
        "outcome_reason": review.get("outcome_reason"),
        "review_by": review.get("review_by"),
        "pr_id": review.get("pr_id"),
        "pr_url": review.get("pr_url"),
        "last_error": review.get("last_error"),
        "created_at": review.get("created_at"),
        "updated_at": review.get("updated_at"),
    }


def list_reviews(workspace_id: str, state: str | None = None) -> list[dict]:
    try:
        q = (
            get_supabase()
            .table("remediation_reviews")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("updated_at", desc=True)
            .limit(200)
        )
        if state:
            q = q.eq("state", state)
        rows = _rows(q.execute())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read reviews: {exc}")
    return [_summary(r) for r in rows]


def queue_counts(workspace_id: str) -> dict:
    """Sidebar badges: what is waiting on legal, and on the owner."""
    try:
        rows = _rows(
            get_supabase()
            .table("remediation_reviews")
            .select("state")
            .eq("workspace_id", workspace_id)
            .in_("state", list(LIVE_STATES))
            .execute()
        )
    except Exception:
        return {"legal": 0, "owner": 0}
    legal = sum(1 for r in rows if r["state"] == IN_LEGAL_REVIEW)
    owner = sum(
        1 for r in rows if r["state"] in (LEGAL_APPROVED, OWNER_APPROVED, PENDING_OWNER_ACK)
    )
    return {"legal": legal, "owner": owner}


def get_review_detail(workspace_id: str, review_id: str) -> dict:
    review = _get_review(workspace_id, review_id)
    versions = _versions(workspace_id, review_id)
    events = _events(workspace_id, review_id)
    ws = membership_service.get_workspace(workspace_id)
    return {
        **_summary(review),
        "current_version_id": review.get("current_version_id"),
        "require_distinct_approvers": bool(
            (ws.get("settings") or {}).get("require_distinct_approvers")
        ),
        "versions": [
            {
                "id": v["id"],
                "version_no": v["version_no"],
                "author_kind": v["author_kind"],
                "author_name": v.get("author_name"),
                "documents": v.get("documents") or [],
                "instructions": v.get("instructions"),
                "analysis": v.get("analysis") or {},
                "created_at": v.get("created_at"),
            }
            for v in versions
        ],
        "events": [
            {
                "action": e["action"],
                "actor_name": e.get("actor_name"),
                "actor_role": e.get("actor_role"),
                "comment": e.get("comment"),
                "from_state": e.get("from_state"),
                "to_state": e.get("to_state"),
                "at": e.get("at"),
            }
            for e in events
        ],
    }


def reviews_by_gap(workspace_id: str) -> dict[str, dict]:
    """The most relevant review per gap: a live one if any, else the
    latest finished one. Used to derive each finding's display status."""
    try:
        rows = _rows(
            get_supabase()
            .table("remediation_reviews")
            .select("id, gap_id, state, updated_at")
            .eq("workspace_id", workspace_id)
            .order("updated_at", desc=True)
            .execute()
        )
    except Exception:
        # Before migration 006 the table does not exist; no reviews.
        return {}
    out: dict[str, dict] = {}
    for r in rows:
        cur = out.get(r["gap_id"])
        if cur is None or (r["state"] in LIVE_STATES and cur["state"] not in LIVE_STATES):
            out[r["gap_id"]] = r
    return out


def apply_to_gaps(workspace_id: str, gaps: list[Gap]) -> list[Gap]:
    """Attach review id/state and derive the display status."""
    reviews = reviews_by_gap(workspace_id)
    out = []
    for g in gaps:
        r = reviews.get(g.id)
        if r is None:
            out.append(g)
            continue
        status = g.status
        if g.status != "resolved":
            if r["state"] in LIVE_STATES:
                status = "in_review"
            elif r["state"] in (DISMISSED, RISK_ACCEPTED):
                status = r["state"]
        out.append(
            g.model_copy(
                update={"review_id": r["id"], "review_state": r["state"], "status": status}
            )
        )
    return out


# --- writes ---------------------------------------------------------------


def _event(review: dict, ws: Workspace, actor: str, action: str, frm: str, to: str, comment: str | None = None) -> None:
    get_supabase().table("review_events").insert(
        {
            "review_id": review["id"],
            "workspace_id": review["workspace_id"],
            "actor_user_id": ws.user_id,
            "actor_name": actor,
            "actor_role": ws.role,
            "action": action,
            "comment": comment,
            "from_state": frm,
            "to_state": to,
        }
    ).execute()


def _add_version(
    review: dict,
    ws: Workspace | None,
    actor: str,
    kind: str,
    documents: list[dict],
    instructions: str | None = None,
    analysis: dict | None = None,
) -> dict:
    existing = _versions(review["workspace_id"], review["id"])
    parent = existing[-1]["id"] if existing else None
    row = _rows(
        get_supabase()
        .table("draft_versions")
        .insert(
            {
                "review_id": review["id"],
                "workspace_id": review["workspace_id"],
                "version_no": len(existing) + 1,
                "author_kind": kind,
                "author_user_id": ws.user_id if ws else None,
                "author_name": actor,
                "parent_version_id": parent,
                "documents": documents,
                "instructions": instructions,
                "analysis": analysis or {},
            }
        )
        .execute()
    )
    if not row:
        raise HTTPException(status_code=503, detail="Could not store the new version")
    return row[0]


def _advance(review: dict, seen_updated_at: str, patch: dict) -> dict:
    """Optimistic update. One of two concurrent approvals wins; the other
    gets a 409 that says someone else acted first."""
    patch = {**patch, "updated_at": _now()}
    rows = _rows(
        get_supabase()
        .table("remediation_reviews")
        .update(patch)
        .eq("id", review["id"])
        .eq("workspace_id", review["workspace_id"])
        .eq("updated_at", seen_updated_at)
        .execute()
    )
    if not rows:
        raise HTTPException(
            status_code=409,
            detail="Someone else acted on this review first. Refresh to see the latest version.",
        )
    return rows[0]


def _mirror(workspace_id: str, gap_id: str, state: str) -> None:
    from app.services import gap_service

    status = GAP_STATUS_FOR_STATE.get(state)
    if status in ("in_review", "dismissed", "risk_accepted"):
        try:
            gap_service.set_gap_status(workspace_id, gap_id, status)
        except HTTPException as exc:
            # Postgres holds the truth; the graph mirror only stops a
            # re-scan reopening the finding. Logged, not fatal.
            logger.warning("Could not mirror review state onto gap %s: %s", gap_id, exc.detail)


def start_review(ws: Workspace, gap: Gap) -> dict:
    """Called right after a fix is generated. Idempotent: a finding with a
    live review gets that review back rather than a second one."""
    if not gap.remediation_drafts:
        raise HTTPException(status_code=400, detail="No drafted fix to review yet.")
    sb = get_supabase()
    try:
        live = _rows(
            sb.table("remediation_reviews")
            .select("*")
            .eq("workspace_id", ws.workspace_id)
            .eq("gap_id", gap.id)
            .in_("state", list(LIVE_STATES))
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read reviews: {exc}")
    if live:
        return _summary(live[0])

    actor = _actor(ws)
    try:
        created = _rows(
            sb.table("remediation_reviews")
            .insert(
                {
                    "workspace_id": ws.workspace_id,
                    "gap_id": gap.id,
                    "gap_title": gap.title,
                    "state": IN_LEGAL_REVIEW,
                    "created_by": ws.user_id,
                }
            )
            .execute()
        )
    except Exception as exc:
        if "reviews_one_live_per_gap" in str(exc) or "23505" in str(exc):
            return start_review(ws, gap)
        raise HTTPException(status_code=503, detail=f"Could not start the review: {exc}")
    review = created[0]
    version = _add_version(
        review, None, "Niam (AI draft)", "ai", documents_from_drafts(gap.remediation_drafts)
    )
    review = _rows(
        sb.table("remediation_reviews")
        .update({"current_version_id": version["id"]})
        .eq("id", review["id"])
        .eq("workspace_id", review["workspace_id"])
        .execute()
    )[0]
    _event(review, ws, actor, "submitted", None, IN_LEGAL_REVIEW, "AI draft sent to legal review")
    _mirror(ws.workspace_id, gap.id, IN_LEGAL_REVIEW)
    audit_service.log_event(
        ws.workspace_id,
        "review_started",
        "Fix sent to legal review",
        f"{gap.title}: AI draft v1 is waiting for legal review",
        actor=actor,
        metadata={"gap_id": gap.id, "review_id": review["id"]},
    )
    return _summary(review)


def act(
    ws: Workspace,
    review_id: str,
    action: str,
    expected_updated_at: str,
    *,
    comment: str | None = None,
    documents: list[dict] | None = None,
    instructions: str | None = None,
    outcome: str | None = None,
    review_by: date | None = None,
) -> dict:
    """Apply one action. Returns the updated review detail."""
    review = _get_review(ws.workspace_id, review_id)
    t = check_transition(review["state"], action, ws.role)
    actor = _actor(ws)
    frm = review["state"]

    from app.services import gap_service  # circular at import time

    gap = gap_service.get_gap(ws.workspace_id, review["gap_id"])
    versions = _versions(ws.workspace_id, review_id)
    current = versions[-1] if versions else None
    patch: dict = {}
    to = t.next_state

    if action == "edit":
        if not documents:
            raise HTTPException(status_code=422, detail="An edit needs the edited text.")
        # Keep each document's file path from the current version: a
        # reviewer edits wording, not which file the PR touches.
        base = (current or {}).get("documents") or []
        merged = []
        for i, d in enumerate(documents):
            prev = base[i] if i < len(base) else {}
            merged.append(
                {
                    "file_path": prev.get("file_path"),
                    "title": d.get("title") or prev.get("title") or "Amendment",
                    "summary": d.get("summary") or prev.get("summary") or "",
                    "body": d.get("body") or "",
                }
            )
        analysis = analyse_edit(gap, base, merged)
        v = _add_version(review, ws, actor, "human", merged, comment, analysis)
        patch = {"current_version_id": v["id"]}

    elif action == "redo":
        if not instructions or not instructions.strip():
            raise HTTPException(status_code=422, detail="Tell the AI how to redo it.")
        prev_md = "\n\n".join(
            (d.get("body") or "") for d in ((current or {}).get("documents") or [])
        )
        try:
            from reasoning.drafter import RemediationDrafter  # type: ignore

            drafter = RemediationDrafter()
            try:
                out = drafter.redraft_for_gap(
                    ws.workspace_id, review["gap_id"], instructions, prev_md
                )
            finally:
                drafter.close()
        except Exception:
            logger.error("AI redo failed", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="The AI could not produce a new draft right now. Try again, or edit it yourself.",
            )
        doc = {
            "file_path": out.get("file_path")
            or (((current or {}).get("documents") or [{}])[0].get("file_path")),
            "title": out.get("section_title") or "Amendment",
            "summary": out.get("rationale") or "",
            "body": out.get("amendment_markdown") or "",
        }
        analysis = {
            "warnings": [
                f"Citation check: {r}" for r in (out.get("verification_reasons") or [])
            ]
            if not out.get("verified")
            else [],
            "verified_citation": bool(out.get("verified")),
            "checked_at": _now(),
        }
        v = _add_version(review, ws, "Niam (AI redo)", "ai", [doc], instructions, analysis)
        patch = {"current_version_id": v["id"]}

    elif action == "approve":
        if current is None:
            raise HTTPException(status_code=409, detail="There is no version to approve.")
        approvals = dict(review.get("approvals") or {})
        approvals["legal"] = {
            "user_id": ws.user_id,
            "by": actor,
            "role": ws.role,
            "at": _now(),
            "version_no": current["version_no"],
            "version_id": current["id"],
        }
        approvals.pop("owner", None)
        patch = {"approvals": approvals, "current_version_id": current["id"]}

    elif action == "not_required":
        if outcome not in (DISMISSED, RISK_ACCEPTED):
            raise HTTPException(
                status_code=422,
                detail="Say whether the finding is wrong (dismissed) or right but accepted (risk_accepted).",
            )
        if not comment or not comment.strip():
            raise HTTPException(status_code=422, detail="A reason is required.")
        if outcome == RISK_ACCEPTED and review_by is None:
            raise HTTPException(
                status_code=422, detail="Accepted risk needs a date to review it again."
            )
        patch = {
            "proposed_outcome": outcome,
            "outcome_reason": comment.strip(),
            "review_by": review_by.isoformat() if review_by else None,
        }

    elif action == "owner_approve":
        approvals = dict(review.get("approvals") or {})
        legal = approvals.get("legal") or {}
        ws_row = membership_service.get_workspace(ws.workspace_id)
        if (ws_row.get("settings") or {}).get("require_distinct_approvers") and legal.get(
            "user_id"
        ) == ws.user_id:
            raise HTTPException(
                status_code=409,
                detail="This workspace requires a different person for owner approval than for legal approval.",
            )
        approvals["owner"] = {
            "user_id": ws.user_id,
            "by": actor,
            "at": _now(),
            "version_no": legal.get("version_no"),
            "version_id": legal.get("version_id"),
        }
        patch = {"approvals": approvals, "last_error": None}

    elif action == "send_back":
        approvals = dict(review.get("approvals") or {})
        approvals.pop("legal", None)
        approvals.pop("owner", None)
        # Clears a stale PR-failure reason too: sending back is how you
        # act on it (redo or edit the draft), so the old message shouldn't
        # linger once legal is looking at it again.
        patch = {"approvals": approvals, "last_error": None}

    elif action == "confirm":
        to = review.get("proposed_outcome")
        if to not in (DISMISSED, RISK_ACCEPTED):
            raise HTTPException(status_code=409, detail="Nothing was proposed to confirm.")

    elif action == "reject":
        patch = {"proposed_outcome": None, "outcome_reason": None, "review_by": None}

    elif action == "open_pr":
        pass

    if to is not None and to != frm and action != "open_pr":
        patch["state"] = to
    review = _advance(review, expected_updated_at, patch)
    if action not in ("open_pr",):
        _event(review, ws, actor, action, frm, review["state"], comment or instructions)
        _mirror(ws.workspace_id, review["gap_id"], review["state"])

    # Owner approval opens the pull request straight away. If GitHub
    # refuses (dry-run off and repo not allow-listed, no connection...),
    # the review stays owner_approved with the reason, and "open_pr"
    # retries it.
    if action in ("owner_approve", "open_pr"):
        review = _open_pr(ws, review, gap, actor)

    audit_service.log_event(
        ws.workspace_id,
        f"review_{action}",
        _AUDIT_TITLES.get(action, action),
        f"{gap.title}: {frm.replace('_', ' ')} → {review['state'].replace('_', ' ')}",
        actor=actor,
        metadata={
            "gap_id": review["gap_id"],
            "review_id": review["id"],
            "role": ws.role,
            "self_approved": _self_approved(review),
        },
    )
    return get_review_detail(ws.workspace_id, review["id"])


_AUDIT_TITLES = {
    "edit": "Legal edited the fix",
    "redo": "Legal asked the AI to redo the fix",
    "approve": "Legal approved the fix",
    "not_required": "Legal marked the fix not required",
    "owner_approve": "Owner approved the fix",
    "send_back": "Owner sent the fix back to legal",
    "confirm": "Owner confirmed the finding is closed without a change",
    "reject": "Owner sent the not-required decision back to legal",
    "open_pr": "Retried opening the pull request",
}


def _open_pr(ws: Workspace, review: dict, gap: Gap, actor: str) -> dict:
    from app.services import gap_service, github_service

    approvals = review.get("approvals") or {}
    version_id = (approvals.get("legal") or {}).get("version_id") or review.get(
        "current_version_id"
    )
    version = next(
        (v for v in _versions(ws.workspace_id, review["id"]) if v["id"] == version_id), None
    )
    if version is None:
        raise HTTPException(status_code=409, detail="The approved version could not be found.")
    record = {
        "version_no": version["version_no"],
        "legal": approvals.get("legal"),
        "owner": approvals.get("owner"),
        "self_approved": _self_approved(review),
    }
    try:
        pr = github_service.open_compliance_pr(
            ws.workspace_id,
            gap,
            drafts=drafts_from_documents(version.get("documents") or []),
            approval=record,
        )
    except HTTPException as exc:
        return _rows(
            get_supabase()
            .table("remediation_reviews")
            .update({"last_error": str(exc.detail), "updated_at": _now()})
            .eq("id", review["id"])
            .eq("workspace_id", review["workspace_id"])
            .execute()
        )[0]

    gap_service.mark_pr_opened(ws.workspace_id, gap.id, pr.id)
    updated = _rows(
        get_supabase()
        .table("remediation_reviews")
        .update(
            {
                "state": PR_OPENED,
                "pr_id": pr.id,
                "pr_url": pr.github_pr_url or None,
                "last_error": None,
                "updated_at": _now(),
            }
        )
        .eq("id", review["id"])
        .eq("workspace_id", review["workspace_id"])
        .execute()
    )[0]
    _event(updated, ws, actor, "pr_opened", OWNER_APPROVED, PR_OPENED, pr.github_pr_url or "dry run")
    return updated


def open_pr_for_gap(ws: Workspace, gap_id: str) -> dict:
    """The old direct POST /gaps/{id}/open-pr now only works for a finding
    whose review has owner approval. A direct button would make the whole
    approval process decorative."""
    reviews = reviews_by_gap(ws.workspace_id)
    r = reviews.get(gap_id)
    if r is None or r["state"] != OWNER_APPROVED:
        raise HTTPException(
            status_code=409,
            detail="A pull request opens only after legal review and owner approval. Send the fix to review first.",
        )
    full = _get_review(ws.workspace_id, r["id"])
    return act(ws, r["id"], "open_pr", full["updated_at"])
