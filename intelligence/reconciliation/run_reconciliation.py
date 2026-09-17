"""
CLI runner for the reconciliation engine.
Usage:
    python -m reconciliation.run_reconciliation --owner alice@example.com --yes

--owner is required. It decides which subgraph is reconciled, what each
:Gap id is keyed by, and -- the part worth being careful about -- which
gaps the stale sweep is allowed to retire. See reconciler.py.
"""

import argparse
import sys
import logging

from reconciliation.reconciler import Reconciler
from graph.owner import UnknownOwner, resolve_owner_id

# Set up logging for the reconciler
logging.basicConfig(level=logging.INFO)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--owner",
        required=True,
        help="account this run belongs to -- a user id or the email it signed up with. Required: there is no default owner, and guessing one writes into somebody else's graph.",
    )
    parser.add_argument(
        "--system",
        default=None,
        help="override the default system/product name",
    )
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    args = parser.parse_args()


    # An email is what a person types; a uuid is what the app scopes by.
    # Resolving here means an owner that matches no account fails now,
    # loudly, instead of producing a correct subgraph nobody can see.
    try:
        args.owner = resolve_owner_id(args.owner)
    except UnknownOwner as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    if not args.yes:
        answer = (
            input("Run reconciliation and write to graph? [y/N] ")
            .strip()
            .lower()
        )
        if answer != "y":
            print("Stopped.")
            return

    kwargs = {"system_name": args.system} if args.system else {}

    print(
        f"Running reconciliation engine for owner {args.owner}, "
        f"system: {args.system or 'default'}..."
    )
    r = Reconciler(owner_id=args.owner, **kwargs)
    try:
        stats = r.find_and_write_gaps()
        print(f"\nReconciliation complete: {stats}")
    finally:
        r.close()


if __name__ == "__main__":
    main()
