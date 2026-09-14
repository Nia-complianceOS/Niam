"""
Single import point for database access used by app/services/.

Why this indirection: if we ever add a second store (e.g. Postgres
for PR/audit metadata that doesn't belong in the graph), services
keep importing from here and only this file changes. Right now it
just re-exports the Neo4j helpers.
"""

from app.db.neo4j import (
    close_driver,
    get_driver,
    run_query,
    verify_connectivity as verify_neo4j_connectivity,
)
from app.db.supabase import (
    get_supabase,
    verify_connectivity as verify_supabase_connectivity,
)

__all__ = [
    "run_query",
    "get_driver",
    "verify_neo4j_connectivity",
    "close_driver",
    "get_supabase",
    "verify_supabase_connectivity",
]
