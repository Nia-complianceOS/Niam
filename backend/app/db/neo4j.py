"""
Neo4j connection ownership.

Per the team split: Backend provisions and keeps this reachable.
The Data & Graph Intelligence module writes to this same instance
using its own driver session (see the onboarding doc — Data lead
connects with the neo4j Python driver directly for ingestion/graph
building). This module is what the FastAPI *read* routes use to
query the graph the intelligence pipeline has built.

Import `get_driver()` for direct session control, or `run_query()`
for the common case of "run this Cypher, get back a list of dicts".
"""

from functools import lru_cache

from neo4j import Driver, GraphDatabase

from app.core.config import get_settings


@lru_cache
def get_driver() -> Driver:
    settings = get_settings()
    return GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )


def run_query(query: str, params: dict | None = None) -> list[dict]:
    """Run a Cypher query and return records as a list of plain dicts."""
    driver = get_driver()
    with driver.session() as session:
        result = session.run(query, params or {})
        return [record.data() for record in result]


def verify_connectivity() -> bool:
    """Used by the /health endpoint to confirm Neo4j is actually reachable."""
    try:
        get_driver().verify_connectivity()
        return True
    except Exception:
        return False


def close_driver() -> None:
    """Called on app shutdown."""
    if get_driver.cache_info().currsize:
        get_driver().close()