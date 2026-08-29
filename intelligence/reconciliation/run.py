"""
CLI runner for the reconciliation engine.
"""

import argparse
import logging
import sys

from reconciliation.reconciler import Reconciler

logging.basicConfig(level=logging.INFO)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="Confirm execution")
    args = parser.parse_args()

    if not args.yes:
        print("Use --yes to run the reconciliation engine.")
        sys.exit(1)

    print("Running reconciliation engine...")
    r = Reconciler()
    try:
        stats = r.find_and_write_gaps()
        print(f"Reconciliation complete: {stats}")
    finally:
        r.close()


if __name__ == "__main__":
    main()
