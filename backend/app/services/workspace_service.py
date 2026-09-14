"""
Managing what an account has scanned: listing it, and removing it.

Two problems this exists to solve, and the second is worse than the first.

**Scans could not be removed.** A user scanned a repository, and its
vendors, data types and findings were theirs forever. Disconnecting GitHub
did not help -- correctly, since disconnecting a credential should not
destroy the findings that credential produced -- so there was no path at
all from "I scanned the wrong repo" back to a clean account.

**Two repositories silently merged.** Every scan from the UI landed in one
:System, because the UI never sent a system_name and the default is a
constant. Scan repo A, then repo B, and you got one graph containing both,
with no way to tell which repository a vendor came from. That is not stale
data, it is wrong data: a finding attributed to the wrong codebase sends a
lawyer to read the wrong file.

So a repository is now its own :System, one per (account, repository), and
removal works at that granularity.

The subtle part is orphan cleanup. :DataType and :Vendor are owned by the
ACCOUNT, not by the system -- two repositories that both send email to
Stripe share one :Vendor node -- so deleting a system must not delete a
vendor another system still uses. Nor may it keep one that nothing uses,
which would leave a dashboard counting vendors that no longer come from
anywhere.
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException

from app.db.neo4j import run_query
from app.db.supabase import get_supabase

logger = logging.getLogger("niam.workspace")

_SYSTEM_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def system_name_for_repo(repo_full_name: str) -> str:
    """A :System name derived from the repository it represents.

    `owner/repo` becomes `owner__repo`: the API's system_name validator
    allows letters, digits, dot, underscore and hyphen, and a slash would
    be rejected. The real full name is kept as a property on the node, so
    nothing has to reverse this to display it.
    """
    slug = _SYSTEM_NAME_RE.sub("-", repo_full_name.replace("/", "__"))
    return slug[:64] or "unnamed-system"


# --- listing -----------------------------------------------------------

_LIST = """
MATCH (s:System {owner_id: $owner_id})
OPTIONAL MATCH (s)-[:COLLECTS]->(d:DataType)
OPTIONAL MATCH (d)-[:SENT_TO]->(v:Vendor {owner_id: $owner_id})
WITH s,
     count(DISTINCT d) AS data_types,
     count(DISTINCT v) AS vendors
RETURN s.name AS system_name,
       coalesce(s.repo, s.name) AS repo,
       data_types, vendors
"""

# Gap ids are `gap-{owner}-{system}-...` (reconciler.gap_id_prefix). The
# owner filter is the guarantee; the prefix narrows to one system.
_COUNT_GAPS = """
MATCH (g:Gap {owner_id: $owner_id})
WHERE g.id STARTS WITH $prefix
RETURN count(g) AS c
"""


def list_scanned_repositories(owner_id: str) -> list[dict]:
    try:
        rows = run_query(_LIST, {"owner_id": owner_id})
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
        
    try:
        supabase = get_supabase()
        response = supabase.table("scans").select("system_name, started_at").eq("user_id", owner_id).execute()
        scan_data = response.data or []
    except Exception:
        scan_data = []

    last_scans = {}
    for scan in scan_data:
        sn = scan.get("system_name")
        started_at = scan.get("started_at")
        if sn and started_at:
            if sn not in last_scans or started_at > last_scans[sn]:
                last_scans[sn] = started_at

    for row in rows:
        row["last_scan"] = last_scans.get(row["system_name"])
        
    # Sort: coalesce(last_scan, '') DESC, repo ASC
    rows.sort(key=lambda x: x.get("repo") or "")
    rows.sort(key=lambda x: x.get("last_scan") or "", reverse=True)

    out = []
    for row in rows:
        prefix = f"gap-{owner_id}-{row['system_name']}-"
        try:
            gap_rows = run_query(
                _COUNT_GAPS, {"owner_id": owner_id, "prefix": prefix}
            )
            gaps = gap_rows[0]["c"] if gap_rows else 0
        except RuntimeError:
            gaps = 0
        out.append({**row, "gaps": gaps})
    return out


# --- removing one repository -------------------------------------------

# Order matters. Drafts and pull requests hang off gaps, so they go first
# or the traversal that finds them has nothing left to walk.
_DELETE_DRAFTS = """
MATCH (g:Gap {owner_id: $owner_id})-[:HAS_DRAFT]->(rd:RemediationDraft)
WHERE g.id STARTS WITH $prefix
WITH DISTINCT rd LIMIT 5000
DETACH DELETE rd
RETURN count(*) AS deleted
"""

_DELETE_PRS = """
MATCH (g:Gap {owner_id: $owner_id})-[:HAS_PR]->(pr:PullRequest)
WHERE g.id STARTS WITH $prefix
WITH DISTINCT pr LIMIT 5000
DETACH DELETE pr
RETURN count(*) AS deleted
"""

_DELETE_GAPS = """
MATCH (g:Gap {owner_id: $owner_id})
WHERE g.id STARTS WITH $prefix
WITH g LIMIT 5000
DETACH DELETE g
RETURN count(*) AS deleted
"""

_DELETE_SYSTEM = """
MATCH (s:System {owner_id: $owner_id, name: $system_name})
DETACH DELETE s
RETURN count(*) AS deleted
"""

_DELETE_POLICIES = """
MATCH (p:PolicyDocument {owner_id: $owner_id})
WHERE p.repo = $repo
WITH p LIMIT 5000
DETACH DELETE p
RETURN count(*) AS deleted
"""

# Orphans: nothing this account still has points at them.
#
# A :DataType is in use while some :System collects it OR some surviving
# policy document discloses it. GOVERNED_BY does NOT count -- a clause
# edge says the Act covers the category, not that this account handles it,
# and treating it as use would leave every data type alive forever.
_DELETE_ORPHAN_DATA_TYPES = """
MATCH (d:DataType {owner_id: $owner_id})
WHERE NOT (:System {owner_id: $owner_id})-[:COLLECTS]->(d)
  AND NOT (:PolicyDocument {owner_id: $owner_id})-[:DISCLOSES]->(d)
WITH d LIMIT 5000
DETACH DELETE d
RETURN count(*) AS deleted
"""

_DELETE_ORPHAN_VENDORS = """
MATCH (v:Vendor {owner_id: $owner_id})
WHERE NOT (:DataType {owner_id: $owner_id})-[:SENT_TO]->(v)
  AND NOT (:PolicyDocument {owner_id: $owner_id})-[:NAMES_RECIPIENT]->(v)
WITH v LIMIT 5000
DETACH DELETE v
RETURN count(*) AS deleted
"""


def _run_until_empty(query: str, params: dict) -> int:
    """Loop a LIMIT-ed delete until it stops finding rows.

    Not `CALL {{ ... }} IN TRANSACTIONS`: that only runs in an implicit
    transaction, and run_query opens an explicit one.
    """
    total = 0
    while True:
        rows = run_query(query, params)
        n = rows[0]["deleted"] if rows else 0
        total += n
        if n == 0:
            return total


def delete_repository(owner_id: str, system_name: str) -> dict:
    """Remove one scanned repository's results from this account."""
    try:
        rows = run_query(
            """
            MATCH (s:System {owner_id: $owner_id, name: $system_name})
            RETURN coalesce(s.repo, s.name) AS repo
            """,
            {"owner_id": owner_id, "system_name": system_name},
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if not rows:
        # 404 rather than a silent success: "delete something that is not
        # there" usually means the caller is looking at a stale list.
        raise HTTPException(
            status_code=404,
            detail="No scanned repository by that name on this account",
        )
    repo = rows[0]["repo"]

    prefix = f"gap-{owner_id}-{system_name}-"
    scoped = {"owner_id": owner_id, "prefix": prefix}
    named = {"owner_id": owner_id, "system_name": system_name}

    try:
        removed = {
            "drafts": _run_until_empty(_DELETE_DRAFTS, scoped),
            "pull_requests": _run_until_empty(_DELETE_PRS, scoped),
            "gaps": _run_until_empty(_DELETE_GAPS, scoped),
            "scans": 0,
            "policy_documents": _run_until_empty(
                _DELETE_POLICIES, {"owner_id": owner_id, "repo": repo}
            ),
        }
        try:
            supabase = get_supabase()
            response = supabase.table("scans").delete().eq("user_id", owner_id).eq("system_name", system_name).execute()
            removed["scans"] = len(response.data or [])
        except Exception as exc:
            logger.error("Could not delete scans from Supabase: %s", exc)

        run_query(_DELETE_SYSTEM, named)
        removed["system"] = 1
        # After the system is gone, whatever it alone kept alive is loose.
        removed["data_types"] = _run_until_empty(
            _DELETE_ORPHAN_DATA_TYPES, {"owner_id": owner_id}
        )
        removed["vendors"] = _run_until_empty(
            _DELETE_ORPHAN_VENDORS, {"owner_id": owner_id}
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    logger.info("Removed %s for %s: %s", repo, owner_id, removed)
    return {"repo": repo, "system_name": system_name, "removed": removed}


# --- removing everything for the account --------------------------------

_RESET = [
    ("drafts", """
        MATCH (:Gap {owner_id: $owner_id})-[:HAS_DRAFT]->(rd:RemediationDraft)
        WITH DISTINCT rd LIMIT 5000
        DETACH DELETE rd RETURN count(*) AS deleted
    """),
    ("pull_requests", """
        MATCH (pr:PullRequest {owner_id: $owner_id})
        WITH pr LIMIT 5000 DETACH DELETE pr RETURN count(*) AS deleted
    """),
    ("gaps", """
        MATCH (g:Gap {owner_id: $owner_id})
        WITH g LIMIT 5000 DETACH DELETE g RETURN count(*) AS deleted
    """),
    ("policy_documents", """
        MATCH (p:PolicyDocument {owner_id: $owner_id})
        WITH p LIMIT 5000 DETACH DELETE p RETURN count(*) AS deleted
    """),
    ("vendors", """
        MATCH (v:Vendor {owner_id: $owner_id})
        WITH v LIMIT 5000 DETACH DELETE v RETURN count(*) AS deleted
    """),
    ("data_types", """
        MATCH (d:DataType {owner_id: $owner_id})
        WITH d LIMIT 5000 DETACH DELETE d RETURN count(*) AS deleted
    """),
    ("systems", """
        MATCH (s:System {owner_id: $owner_id})
        WITH s LIMIT 5000 DETACH DELETE s RETURN count(*) AS deleted
    """),
]


def reset_account_data(owner_id: str) -> dict:
    """Delete every finding this account has, keeping the account itself.

    The :User and any :GithubConnection survive -- this is "start over",
    not "close my account". The shared DPDP Act is untouched: it belongs
    to no account and re-extracting it costs a Gemini call per section.
    """
    removed = {}
    try:
        for label, query in _RESET:
            removed[label] = _run_until_empty(query, {"owner_id": owner_id})
            
        supabase = get_supabase()
        
        scans_resp = supabase.table("scans").delete().eq("user_id", owner_id).execute()
        removed["scans"] = len(scans_resp.data or [])
        
        audit_resp = supabase.table("audit_logs").delete().eq("user_id", owner_id).execute()
        removed["audit_logs"] = len(audit_resp.data or [])
        
    except (RuntimeError, Exception) as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    logger.info("Reset account data for %s: %s", owner_id, removed)
    return {"removed": removed, "reset_at": datetime.now(timezone.utc).isoformat()}
