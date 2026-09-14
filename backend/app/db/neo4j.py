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

from neo4j import Driver, GraphDatabase
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.core.config import get_settings


_driver: Driver | None = None

def get_driver() -> Driver:
    global _driver
    settings = get_settings()
    
    if _driver is not None:
        try:
            _driver.verify_connectivity()
            return _driver
        except Exception:
            try:
                _driver.close()
            except Exception:
                pass
            _driver = None

    _driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
    return _driver


def run_query(query: str, params: dict | None = None) -> list[dict]:
    """Run a Cypher query and return records as a list of plain dicts.

    Raises RuntimeError with a clear message if Neo4j is unreachable,
    misconfigured, or the query fails, so callers (services) can decide
    how to degrade (e.g. return an empty graph, or a single stat card
    marked unavailable) instead of leaking a raw driver exception up
    through the API. Driver acquisition happens inside the try block
    on purpose — an empty or malformed NEO4J_URI (the default, unset
    state) can raise before a session is even opened, and that failure
    needs to degrade the same way a mid-query connectivity loss does.
    """
    try:
        driver = get_driver()
        with driver.session() as session:
            result = session.run(query, params or {})
            return [record.data() for record in result]
    except ServiceUnavailable as exc:
        raise RuntimeError(
            "Neo4j is unreachable — check NEO4J_URI and that the instance is running"
        ) from exc
    except Neo4jError as exc:
        raise RuntimeError(f"Neo4j query failed: {exc}") from exc
    except (ValueError, TypeError, OSError) as exc:
        # Driver construction itself can raise these for a malformed or
        # empty NEO4J_URI/credentials, before ServiceUnavailable would
        # ever apply.
        raise RuntimeError(
            f"Neo4j is not configured correctly: {exc}"
        ) from exc


def verify_connectivity() -> bool:
    """Used by the /health endpoint to confirm Neo4j is actually reachable."""
    try:
        get_driver().verify_connectivity()
        return True
    except Exception:
        return False


def close_driver() -> None:
    """Called on app shutdown."""
    global _driver
    if _driver is not None:
        try:
            _driver.close()
        except Exception:
            pass
        _driver = None
