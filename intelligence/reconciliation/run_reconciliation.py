"""
CLI runner for the reconciliation engine.
Usage:
    python -m reconciliation.run_reconciliation --yes
"""

import argparse
import logging

from reconciliation.reconciler import Reconciler

# Set up logging for the reconciler
logging.basicConfig(level=logging.INFO)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--system",
        default=None,
        help="override the default system/product name",
    )
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    args = parser.parse_args()

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
        f"Running reconciliation engine for system: {args.system or 'default'}..."
    )
    r = Reconciler(**kwargs)
    try:
        stats = r.find_and_write_gaps()
        print(f"\nReconciliation complete: {stats}")
    finally:
        r.close()


if __name__ == "__main__":
    main()
