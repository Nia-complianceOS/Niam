"""
Scan state, stored in the graph.

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

:Scan nodes fix all three, and cost one Cypher round trip per progress
event -- which is cheap next to the Gemini call each event is reporting
on.

The log is a list of JSON strings rather than a list of maps: Neo4j
rejects maps as property values, the same constraint that shaped the
provenance arrays in edge_builder.py.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.neo4j import run_query

logger = logging.getLogger("niam.scan")

# A scan that has been "running" for longer than this is not running. The
# process that owned it died without writing a terminal status, and
# without a cutoff it would block that user's next scan forever.
STALE_AFTER = timedelta(minutes=30)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_CREATE = """
MERGE (s:Scan {id: $id})
SET s.repo = $repo,
    s.ref = $ref,
    s.system_name = $system_name,
    s.user_id = $user_id,
    s.trigger = $trigger,
    s.status = 'queued',
    s.log = [],
    s.error = null,
    s.started_at = $now,
    s.updated_at = $now
"""

_SET_STATUS = """
MATCH (s:Scan {id: $id})
SET s.status = $status,
    s.error = $error,
    s.updated_at = $now
"""

_APPEND_LOG = """
MATCH (s:Scan {id: $id})
SET s.log = coalesce(s.log, []) + $entry,
    s.updated_at = $now
"""

_GET = """
MATCH (s:Scan {id: $id})
RETURN s.id AS id, s.status AS status, s.error AS error,
       s.repo AS repo, s.ref AS ref, s.user_id AS user_id,
       coalesce(s.log, []) AS log,
       s.started_at AS started_at, s.updated_at AS updated_at
"""

# Both numbers the rate limiter needs, in one round trip. `running`
# excludes scans whose owning process died -- see STALE_AFTER.
_USER_ACTIVITY = """
MATCH (s:Scan {user_id: $user_id})
WHERE s.started_at >= $window_start
RETURN count(s) AS recent,
       size([x IN collect(s)
             WHERE x.status IN ['queued', 'running']
               AND x.updated_at >= $stale_before]) AS running
"""

_GLOBAL_RUNNING = """
MATCH (s:Scan)
WHERE s.status IN ['queued', 'running'] AND s.updated_at >= $stale_before
RETURN count(s) AS running
"""


def create(
    scan_id: str,
    repo: str,
    ref: str,
    system_name: str | None,
    user_id: str | None,
    trigger: str = "api",
) -> None:
    run_query(
        _CREATE,
        {
            "id": scan_id,
            "repo": repo,
            "ref": ref,
            "system_name": system_name,
            "user_id": user_id,
            "trigger": trigger,
            "now": _now(),
        },
    )


def set_status(scan_id: str, status: str, error: str | None = None) -> None:
    run_query(
        _SET_STATUS,
        {"id": scan_id, "status": status, "error": error, "now": _now()},
    )


def append_log(scan_id: str, event: dict) -> None:
    """Never let a logging failure kill a scan that is otherwise working."""
    try:
        run_query(
            _APPEND_LOG,
            {"id": scan_id, "entry": json.dumps(event), "now": _now()},
        )
    except RuntimeError as exc:
        logger.warning("Could not record scan event for %s: %s", scan_id, exc)


def get(scan_id: str) -> dict[str, Any] | None:
    rows = run_query(_GET, {"id": scan_id})
    if not rows:
        return None
    row = dict(rows[0])
    parsed = []
    for entry in row.get("log") or []:
        try:
            parsed.append(json.loads(entry))
        except (TypeError, ValueError):
            # A malformed entry is still information: show it rather than
            # dropping it silently out of a progress log.
            parsed.append({"event": "log", "message": str(entry)})
    row["log"] = parsed
    return row


def user_activity(user_id: str, window: timedelta) -> tuple[int, int]:
    """(scans started in the window, scans currently running) for one user."""
    now = datetime.now(timezone.utc)
    rows = run_query(
        _USER_ACTIVITY,
        {
            "user_id": user_id,
            "window_start": (now - window).isoformat(),
            "stale_before": (now - STALE_AFTER).isoformat(),
        },
    )
    if not rows:
        return 0, 0
    return rows[0]["recent"], rows[0]["running"]


def global_running() -> int:
    rows = run_query(
        _GLOBAL_RUNNING,
        {
            "stale_before": (
                datetime.now(timezone.utc) - STALE_AFTER
            ).isoformat()
        },
    )
    return rows[0]["running"] if rows else 0
