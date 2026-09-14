"""
neo4j_client.py — connection management for the Living Compliance Graph.

Thin wrapper around the official neo4j driver. Nothing clever here on
purpose: connection lifecycle, session handling, and a single
`run_write` / `run_read` entrypoint that everything else in graph/
builds on. Batching, retries, and Cypher construction live in
graph_writer.py, not here.

Env vars expected (per onboarding doc Section 03 — never hardcode these):
    NEO4J_URI
    NEO4J_USER
    NEO4J_PASSWORD
"""

import logging
import os
from typing import Optional
from graph.env import load_env
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable

load_env()

logger = logging.getLogger(__name__)


class Neo4jClient:
    """Wraps a neo4j.Driver with app-specific write/read helpers."""

    def __init__(
        self,
        uri: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self._uri = uri or os.getenv("NEO4J_URI")
        self._user = (
            user or os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME")
        )
        self._password = password or os.getenv("NEO4J_PASSWORD")

        if not all([self._uri, self._user, self._password]):
            raise ValueError(
                "Missing Neo4j credentials. Expected NEO4J_URI, NEO4J_PASSWORD, "
                "and either NEO4J_USER or NEO4J_USERNAME in the environment "
                "(.env) — see onboarding doc Section 03. Never pass these as "
                "literals in code."
            )

        self._driver = GraphDatabase.driver(
            self._uri, auth=(self._user, self._password)
        )

    def verify_connectivity(self) -> bool:
        try:
            self._driver.verify_connectivity()
            logger.info("Neo4j connectivity OK (%s)", self._uri)
            return True
        except ServiceUnavailable as e:
            logger.error("Neo4j unreachable: %s", e)
            return False

    def run_write(self, query: str, parameters: Optional[dict] = None):
        """Execute a single write query in its own transaction. Returns summary counters."""
        parameters = parameters or {}
        with self._driver.session() as session:
            result = session.execute_write(self._tx_run, query, parameters)
        return result

    def run_write_batch(self, query: str, rows: list, batch_key: str = "rows"):
        """
        Execute a write query once per UNWIND batch instead of once per row.
        `query` should reference `$rows` and UNWIND it, e.g.:

            UNWIND $rows AS row
            MERGE (d:DataType {name: row.data_type})
            ...

        This is the pattern graph_writer.py uses for classifier output —
        one round trip per batch instead of one per candidate line.
        """
        with self._driver.session() as session:
            result = session.execute_write(
                self._tx_run, query, {batch_key: rows}
            )
        return result

    def run_read(self, query: str, parameters: Optional[dict] = None):
        parameters = parameters or {}
        with self._driver.session() as session:
            result = session.execute_read(self._tx_run, query, parameters)
        return result

    @staticmethod
    def _tx_run(tx, query, parameters):
        res = tx.run(query, parameters)
        return [record.data() for record in res]

    def close(self):
        self._driver.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
