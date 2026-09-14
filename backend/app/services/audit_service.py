import logging
from datetime import datetime, timezone

from app.db.supabase import get_supabase

logger = logging.getLogger("niam.audit")

def _now() -> datetime:
    return datetime.now(timezone.utc)

def log_event(
    user_id: str,
    event_type: str,
    title: str,
    description: str,
    actor: str,
    metadata: dict | None = None
) -> None:
    """
    Fire-and-forget logging of an audit event to Supabase.
    Will never raise an exception to the caller.
    """
    if not user_id:
        return

    try:
        supabase = get_supabase()
        supabase.table("audit_logs").insert(
            {
                "user_id": user_id,
                "event_type": event_type,
                "title": title,
                "description": description,
                "actor": actor,
                "metadata": metadata or {},
                "occurred_at": _now().isoformat(),
            }
        ).execute()
    except Exception as exc:
        # Fire-and-forget: we do not crash the caller if audit logging fails
        logger.warning(f"Failed to log audit event '{event_type}' for user {user_id}: {exc}")


def list_events(user_id: str, limit: int = 100) -> list[dict]:
    """
    Retrieve audit events for a user, ordered by occurred_at descending.
    Never raises an exception; returns an empty list on failure.
    """
    if not user_id:
        return []

    try:
        supabase = get_supabase()
        response = (
            supabase.table("audit_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("occurred_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []
    except Exception as exc:
        logger.warning(f"Failed to retrieve audit events for user {user_id}: {exc}")
        return []
