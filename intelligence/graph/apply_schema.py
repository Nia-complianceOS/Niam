"""CLI: applies schema.py's uniqueness constraints to the connected Neo4j instance.
Safe to re-run — every statement is IF NOT EXISTS."""

import logging
from graph.neo4j_client import Neo4jClient
from graph.schema import apply_schema

logging.basicConfig(
    level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
)


def main():
    client = Neo4jClient()
    try:
        apply_schema(client)
        print("Schema constraints applied (or already present).")
    finally:
        client.close()


if __name__ == "__main__":
    main()
