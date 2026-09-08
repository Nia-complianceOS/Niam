"""
CLI runner for the reconciliation engine.

    python -m reconciliation.run --owner alice@example.com --yes

--owner is required; see reconciliation/run_reconciliation.py for the
fuller runner with a --system override.
"""

import argparse
import logging
import sys

from reconciliation.reconciler import Reconciler
from graph.neo4j_client import Neo4jClient
from graph.owner import UnknownOwner, resolve_owner_id

logging.basicConfig(level=logging.INFO)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--owner",
        required=True,
        help="account this run belongs to -- a user id or the email it signed up with. Required: there is no default owner, and guessing one writes into somebody else's graph.",
    )
    parser.add_argument("--yes", action="store_true", help="Confirm execution")
    args = parser.parse_args()


    # An email is what a person types; a uuid is what the app scopes by.
    # Resolving here means an owner that matches no account fails now,
    # loudly, instead of producing a correct subgraph nobody can see.
    try:
        args.owner = resolve_owner_id(Neo4jClient(), args.owner)
    except UnknownOwner as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    if not args.yes:
        print("Use --yes to run the reconciliation engine.")
        sys.exit(1)

    print(f"Running reconciliation engine for owner {args.owner}...")
    r = Reconciler(owner_id=args.owner)
    try:
        stats = r.find_and_write_gaps()
        print(f"Reconciliation complete: {stats}")
    finally:
        r.close()


if __name__ == "__main__":
    main()
