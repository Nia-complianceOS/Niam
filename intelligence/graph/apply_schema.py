"""CLI: applies schema.py's uniqueness constraints and indexes to the
connected Neo4j instance. Safe to re-run — every statement is
IF NOT EXISTS.

    python -m graph.apply_schema --owner alice@example.com

--owner is required even though the constraints themselves are
instance-wide rather than per-account. Two reasons, and neither is
ceremony:

  - Every other CLI in this codebase refuses to run without an owner
    (smoke/TENANCY_CONTRACT.md). One that silently does not is the one a
    tired operator reaches for at 2am against the wrong database.
  - What this applies IS the tenancy schema -- the scoped `uid`
    constraints and the `owner_id` indexes that make per-account
    filtering both correct and fast. Naming the account you are setting
    up puts that account in the log line, which is the record that says
    which instance was prepared for whom.

The owner is recorded and printed. It is deliberately not written into
the graph: no node here belongs to anyone.
"""

import argparse
import logging

from graph.neo4j_client import Neo4jClient
from graph.schema import apply_schema

logging.basicConfig(
    level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
)

logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--owner",
        required=True,
        help=(
            "account this run belongs to -- a user id or the email it "
            "signed up with. Required: there is no default owner, and "
            "guessing one writes into somebody else's graph. Constraints "
            "are instance-wide, so this is recorded rather than applied."
        ),
    )
    args = parser.parse_args()

    client = Neo4jClient()
    try:
        logger.info(
            "Applying instance-wide schema (requested by owner %s)",
            args.owner,
        )
        apply_schema(client)
        print(
            "Schema constraints and indexes applied (or already present). "
            f"Requested by owner: {args.owner}."
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
