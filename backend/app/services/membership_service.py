"""
Workspaces, members and invite links (migration 004).

A workspace is the unit that owns findings: every `owner_id` in the graph
and every tenant-scoped Postgres row is a workspace id. Each account gets
one workspace whose id IS its user id, which is why no existing data had
to move when this was introduced (see deps.py and 004_workspaces.sql).

Roles:
  owner   -- everything, including final approval, invites, GitHub, reset
  legal   -- reads everything; reviews, edits and approves drafted fixes
  member  -- reads everything; scans and generates fixes

Invite links carry a random token that is shown once and stored only as
a SHA-256 hash, expire after 7 days, and work once.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.api.deps import ROLE_LEGAL, ROLE_MEMBER, ROLE_OWNER, Workspace
from app.db.supabase import get_supabase

logger = logging.getLogger("niam.membership")

ROLES = (ROLE_OWNER, ROLE_LEGAL, ROLE_MEMBER)
INVITE_TTL = timedelta(days=7)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _rows(resp) -> list[dict]:
    data = getattr(resp, "data", None) if resp is not None else None
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


# --- resolution (called by deps.current_workspace on every request) ----


def memberships(user_id: str) -> list[dict]:
    """Every workspace this user belongs to, with role and name."""
    try:
        sb = get_supabase()
        rows = _rows(
            sb.table("workspace_members")
            .select("workspace_id, role, joined_at, workspaces(name)")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        # Before migration 004 is applied the table does not exist. The
        # app then behaves exactly as it did before workspaces: everyone
        # acts in their own. Logged, because it hides a missing migration.
        logger.warning("Workspace membership lookup failed (%s); using personal workspace", exc)
        return []
    out = []
    for r in rows:
        ws = r.get("workspaces") or {}
        out.append(
            {
                "workspace_id": r.get("workspace_id"),
                "role": r.get("role"),
                "name": (ws.get("name") if isinstance(ws, dict) else None) or "Workspace",
                "joined_at": r.get("joined_at"),
                "personal": r.get("workspace_id") == user_id,
            }
        )
    out.sort(key=lambda m: (not m["personal"], m["name"] or ""))
    return out


def resolve_workspace(user_id: str, requested: str | None) -> Workspace | None:
    """The workspace this request acts in, or None if not a member.

    No workspace requested: the user's own. If the membership table is
    unavailable (migration not applied), the user's own workspace with the
    owner role -- identical to the behaviour before workspaces existed.
    """
    rows = memberships(user_id)
    if not rows:
        if requested and requested != user_id:
            return None
        return Workspace(user_id=user_id, workspace_id=user_id, role=ROLE_OWNER)

    by_id = {r["workspace_id"]: r for r in rows}
    if requested:
        row = by_id.get(requested)
        if row is None:
            return None
        return Workspace(user_id=user_id, workspace_id=requested, role=row["role"])

    row = by_id.get(user_id) or rows[0]
    return Workspace(user_id=user_id, workspace_id=row["workspace_id"], role=row["role"])


# --- lifecycle ----------------------------------------------------------


def create_personal_workspace(user_id: str, name: str | None, email: str) -> None:
    """Called at signup (password or GitHub). Idempotent. Never raises:
    resolve_workspace() already falls back to the personal workspace, so
    a failure here costs nothing but a log line."""
    label = (name or "").strip() or email.split("@")[0]
    try:
        sb = get_supabase()
        sb.table("workspaces").upsert(
            {"id": user_id, "name": f"{label}'s workspace", "created_by": user_id},
            on_conflict="id",
        ).execute()
        sb.table("workspace_members").upsert(
            {"workspace_id": user_id, "user_id": user_id, "role": ROLE_OWNER},
            on_conflict="workspace_id,user_id",
        ).execute()
    except Exception as exc:
        logger.warning("Could not create personal workspace for %s: %s", user_id, exc)


def get_workspace(workspace_id: str) -> dict:
    try:
        rows = _rows(
            get_supabase()
            .table("workspaces")
            .select("id, name, settings, created_at")
            .eq("id", workspace_id)
            .execute()
        )
    except Exception:
        rows = []
    if not rows:
        return {"id": workspace_id, "name": "Workspace", "settings": {}}
    row = rows[0]
    row["settings"] = row.get("settings") or {}
    return row


def update_settings(workspace_id: str, name: str | None, require_distinct: bool | None) -> dict:
    ws = get_workspace(workspace_id)
    settings = dict(ws.get("settings") or {})
    if require_distinct is not None:
        settings["require_distinct_approvers"] = bool(require_distinct)
    patch: dict = {"settings": settings}
    if name is not None and name.strip():
        patch["name"] = name.strip()[:80]
    try:
        get_supabase().table("workspaces").update(patch).eq("id", workspace_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not update workspace: {exc}")
    return get_workspace(workspace_id)


def list_members(workspace_id: str) -> list[dict]:
    try:
        rows = _rows(
            get_supabase()
            .table("workspace_members")
            .select("user_id, role, joined_at, users(email, name)")
            .eq("workspace_id", workspace_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read members: {exc}")
    out = []
    for r in rows:
        u = r.get("users") or {}
        out.append(
            {
                "user_id": r.get("user_id"),
                "role": r.get("role"),
                "joined_at": r.get("joined_at"),
                "email": u.get("email") if isinstance(u, dict) else None,
                "name": u.get("name") if isinstance(u, dict) else None,
            }
        )
    order = {ROLE_OWNER: 0, ROLE_LEGAL: 1, ROLE_MEMBER: 2}
    out.sort(key=lambda m: (order.get(m["role"], 9), m.get("email") or ""))
    return out


def _owner_count(workspace_id: str) -> int:
    return sum(1 for m in list_members(workspace_id) if m["role"] == ROLE_OWNER)


def change_role(workspace_id: str, target_user_id: str, role: str) -> None:
    if role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role '{role}'")
    members = {m["user_id"]: m for m in list_members(workspace_id)}
    if target_user_id not in members:
        raise HTTPException(status_code=404, detail="Not a member of this workspace")
    if (
        members[target_user_id]["role"] == ROLE_OWNER
        and role != ROLE_OWNER
        and _owner_count(workspace_id) <= 1
    ):
        raise HTTPException(
            status_code=409,
            detail="A workspace must keep at least one owner. Make someone else an owner first.",
        )
    if target_user_id == workspace_id and role != ROLE_OWNER:
        # The personal workspace's creator is who the GitHub connection
        # and the Postgres foreign keys belong to.
        raise HTTPException(
            status_code=409,
            detail="The person who created this workspace stays its owner.",
        )
    get_supabase().table("workspace_members").update({"role": role}).eq(
        "workspace_id", workspace_id
    ).eq("user_id", target_user_id).execute()


def remove_member(workspace_id: str, target_user_id: str) -> None:
    if target_user_id == workspace_id:
        raise HTTPException(
            status_code=409,
            detail="The person who created this workspace cannot be removed from it.",
        )
    get_supabase().table("workspace_members").delete().eq(
        "workspace_id", workspace_id
    ).eq("user_id", target_user_id).execute()


# --- invites ------------------------------------------------------------


def create_invite(workspace_id: str, created_by: str, role: str) -> dict:
    if role not in (ROLE_LEGAL, ROLE_MEMBER, ROLE_OWNER):
        raise HTTPException(status_code=422, detail=f"Unknown role '{role}'")
    token = secrets.token_urlsafe(32)
    expires = _now() + INVITE_TTL
    try:
        get_supabase().table("workspace_invites").insert(
            {
                "workspace_id": workspace_id,
                "token_hash": _hash(token),
                "role": role,
                "created_by": created_by,
                "expires_at": expires.isoformat(),
            }
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not create invite: {exc}")
    # The only time the raw token exists outside the invitee's browser.
    return {"token": token, "role": role, "expires_at": expires.isoformat()}


def list_invites(workspace_id: str) -> list[dict]:
    try:
        rows = _rows(
            get_supabase()
            .table("workspace_invites")
            .select("id, role, created_at, expires_at, used_at")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
    except Exception:
        return []
    return rows


def revoke_invite(workspace_id: str, invite_id: str) -> None:
    get_supabase().table("workspace_invites").delete().eq("id", invite_id).eq(
        "workspace_id", workspace_id
    ).execute()


def _find_invite(token: str) -> dict | None:
    rows = _rows(
        get_supabase()
        .table("workspace_invites")
        .select("id, workspace_id, role, expires_at, used_at, workspaces(name)")
        .eq("token_hash", _hash(token))
        .execute()
    )
    return rows[0] if rows else None


def _usable(inv: dict | None) -> bool:
    if not inv or inv.get("used_at"):
        return False
    try:
        exp = datetime.fromisoformat(str(inv["expires_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return exp > _now()


def preview_invite(token: str) -> dict:
    """What the invite page shows before the user accepts. Same 404 for
    unknown, used and expired, like OAuth state."""
    try:
        inv = _find_invite(token)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read invite: {exc}")
    if not _usable(inv):
        raise HTTPException(status_code=404, detail="This invite link is invalid or has expired.")
    ws = inv.get("workspaces") or {}
    return {
        "workspace_id": inv["workspace_id"],
        "workspace_name": ws.get("name") if isinstance(ws, dict) else "Workspace",
        "role": inv["role"],
        "expires_at": inv["expires_at"],
    }


def accept_invite(token: str, user_id: str) -> dict:
    try:
        inv = _find_invite(token)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not read invite: {exc}")
    if not _usable(inv):
        raise HTTPException(status_code=404, detail="This invite link is invalid or has expired.")

    sb = get_supabase()
    # Mark used first, conditionally, so two people racing one link
    # cannot both get in.
    claimed = _rows(
        sb.table("workspace_invites")
        .update({"used_at": _now().isoformat(), "used_by": user_id})
        .eq("id", inv["id"])
        .is_("used_at", "null")
        .execute()
    )
    if not claimed:
        raise HTTPException(status_code=404, detail="This invite link has already been used.")

    existing = [m for m in list_members(inv["workspace_id"]) if m["user_id"] == user_id]
    if existing:
        role = existing[0]["role"]
    else:
        role = inv["role"]
        sb.table("workspace_members").insert(
            {
                "workspace_id": inv["workspace_id"],
                "user_id": user_id,
                "role": role,
            }
        ).execute()
    from app.api.deps import clear_membership_cache

    clear_membership_cache()
    ws = inv.get("workspaces") or {}
    return {
        "workspace_id": inv["workspace_id"],
        "workspace_name": ws.get("name") if isinstance(ws, dict) else "Workspace",
        "role": role,
    }
