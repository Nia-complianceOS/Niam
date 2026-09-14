"""
Scan state, stored in the database.

Scans used to live in `scan_service.SCANS`, a module-level dict. Three
things were wrong with that once this became a deployed app rather than
one process on one laptop:

  1. A restart erased every scan. A user watching the progress stream
     when the dyno recycled saw it hang, not fail -- the SSE loop polls a
     dict that no longer has their key.
  2. Two instances could not see each other's scans. Render can run more
     than one, and POST /scan on instance A followed by GET
     /scan/{id}/events on instance B is a 404 for a scan that is running
     perfectly well.
  3. Nothing could be rate-limited, because nothing remembered what had
     already been run. "Ten scans an hour" is unanswerable from a dict
     that empties on restart.

Database tables fix all three, and cost one round trip per progress
event -- which is cheap next to the Gemini call each event is reporting
on.

The log is stored as a JSONB array. Since it is native JSONB, we store actual 
JSON objects directly without needing json.dumps/json.loads for individual entries.

TENANCY (smoke/TENANCY_CONTRACT.md). `scans` table spells its owner 
`user_id` rather than `owner_id`. Every function here therefore takes 
`owner_id` first and filters on `user_id`. A filter in the pattern cannot 
be forgotten by a caller.

The single deliberate exception is global_running(), which counts running
scans across every account on purpose -- see its docstring.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.supabase import get_supabase

logger = logging.getLogger("niam.scan")

# A scan that has been "running" for longer than this is not running. The
# process that owned it died without writing a terminal status, and
# without a cutoff it would block that user's next scan forever.
STALE_AFTER = timedelta(minutes=30)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create(
    owner_id: str,
    scan_id: str,
    repo: str,
    ref: str,
    system_name: str | None,
    trigger: str = "api",
) -> None:
    """Register a scan against the account that asked for it.

    `owner_id` is required. A scan row with no owner is unreadable by
    get() (which filters on it), uncounted by the per-user rate limiter,
    and its results would be written into the database under no account --
    so there is nothing useful an ownerless scan could do.
    """
    if not owner_id:
        raise ValueError(
            "owner_id is required: a scan with no owner is invisible to "
            "every user and writes its findings into nobody's database"
        )
    try:
        supabase = get_supabase()
        supabase.table("scans").insert(
            {
                "id": scan_id,
                "repo": repo,
                "ref": ref,
                "system_name": system_name,
                "user_id": owner_id,
                "trigger": trigger,
                "status": "queued",
                "log": [],
                "error": None,
                "started_at": _now(),
                "updated_at": _now(),
            }
        ).execute()
    except Exception as e:
        raise RuntimeError(f"Database error in create: {e}")


def set_status(
    owner_id: str, scan_id: str, status: str, error: str | None = None
) -> None:
    try:
        supabase = get_supabase()
        supabase.table("scans").update(
            {
                "status": status,
                "error": error,
                "updated_at": _now(),
            }
        ).eq("id", scan_id).eq("user_id", owner_id).execute()
    except Exception as e:
        raise RuntimeError(f"Database error in set_status: {e}")


def append_log(owner_id: str, scan_id: str, event: dict) -> None:
    """Never let a logging failure kill a scan that is otherwise working.

    Uses PostgreSQL function `append_scan_log` for atomic append:
        CREATE OR REPLACE FUNCTION append_scan_log(
          p_scan_id TEXT, p_user_id TEXT, p_event JSONB
        ) RETURNS VOID AS $$
          UPDATE scans
          SET log = COALESCE(log, '[]'::jsonb) || p_event,
              updated_at = NOW()
          WHERE id = p_scan_id AND user_id = p_user_id;
        $$ LANGUAGE SQL;

    Falls back to read-then-write if the RPC function has not been applied
    to the Supabase instance. Note: concurrent events could race under the fallback,
    but progress logs are append-only telemetry, so lost entries are cosmetic.
    """
    try:
        supabase = get_supabase()

        try:
            supabase.rpc(
                "append_scan_log",
                {
                    "p_scan_id": scan_id,
                    "p_user_id": owner_id,
                    "p_event": event,
                },
            ).execute()
            return
        except Exception:
            # RPC function unavailable or failed; fall back to select-append-update
            pass

        # Read the current log
        response = (
            supabase.table("scans")
            .select("log")
            .eq("id", scan_id)
            .eq("user_id", owner_id)
            .maybe_single()
            .execute()
        )

        if not response or not response.data:
            return

        current_log = response.data.get("log") or []
        current_log.append(event)

        # Write back
        supabase.table("scans").update(
            {
                "log": current_log,
                "updated_at": _now(),
            }
        ).eq("id", scan_id).eq("user_id", owner_id).execute()

    except Exception as exc:
        logger.warning("Could not record scan event for %s: %s", scan_id, exc)


def get(owner_id: str, scan_id: str) -> dict[str, Any] | None:
    """One account's scan, or None.

    None covers both "no such scan" and "that scan is not yours", and
    callers should keep it that way in the response: distinguishing the
    two would confirm to a stranger that a given scan id exists.
    """
    try:
        supabase = get_supabase()
        response = (
            supabase.table("scans")
            .select("*")
            .eq("id", scan_id)
            .eq("user_id", owner_id)
            .maybe_single()
            .execute()
        )
        
        if not response.data:
            return None
            
        row = response.data
        if not row.get("log"):
            row["log"] = []
            
        return row
    except Exception as e:
        raise RuntimeError(f"Database error in get: {e}")


def user_activity(owner_id: str, window: timedelta) -> tuple[int, int]:
    """(scans started in the window, scans currently running) for one user."""
    try:
        now = datetime.now(timezone.utc)
        window_start = (now - window).isoformat()
        stale_before = (now - STALE_AFTER).isoformat()
        
        supabase = get_supabase()
        
        recent_resp = (
            supabase.table("scans")
            .select("id", count="exact")
            .eq("user_id", owner_id)
            .gte("started_at", window_start)
            .execute()
        )
        recent_count = recent_resp.count if recent_resp.count is not None else 0
        
        running_resp = (
            supabase.table("scans")
            .select("id", count="exact")
            .eq("user_id", owner_id)
            .in_("status", ["queued", "running"])
            .gte("updated_at", stale_before)
            .execute()
        )
        running_count = running_resp.count if running_resp.count is not None else 0
        
        return recent_count, running_count
    except Exception as e:
        raise RuntimeError(f"Database error in user_activity: {e}")


def global_running() -> int:
    """Scans running across EVERY account -- intentionally unscoped.

    This is the only cross-tenant read in the file. It backs the global
    concurrency cap in scan.py, and the question it answers ("is the
    shared classifier quota saturated right now") is not answerable from
    one account's rows. It returns a count and nothing else: no scan id,
    no repository, no owner.
    """
    try:
        stale_before = (datetime.now(timezone.utc) - STALE_AFTER).isoformat()
        
        supabase = get_supabase()
        running_resp = (
            supabase.table("scans")
            .select("id", count="exact")
            .in_("status", ["queued", "running"])
            .gte("updated_at", stale_before)
            .execute()
        )
        return running_resp.count if running_resp.count is not None else 0
    except Exception as e:
        raise RuntimeError(f"Database error in global_running: {e}")
