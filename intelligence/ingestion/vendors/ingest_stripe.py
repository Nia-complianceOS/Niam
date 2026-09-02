"""
ingest_stripe.py — CLI for the Stripe vendor ingestion path, mirroring
scan_remote_repo.py's shape: fetch -> map -> summarize -> (optionally) write.

Usage:
    python ingest_stripe.py --limit 200
    python ingest_stripe.py --limit 200 --write        # also writes to Neo4j
    python ingest_stripe.py --event-types customer.created charge.succeeded
"""

import argparse
import logging

from ingestion.vendors.stripe import StripeIngestion
from ingestion.vendors.stripe_mapper import map_fields_to_data_types

logging.basicConfig(
    level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest Stripe event schema into the compliance graph"
    )
    parser.add_argument(
        "--limit", type=int, default=100, help="max events to sample"
    )
    parser.add_argument(
        "--event-types",
        nargs="*",
        default=None,
        help="restrict to specific Stripe event types",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="write results into Neo4j (default: dry run)",
    )
    args = parser.parse_args()

    ingestion = StripeIngestion()
    events = ingestion.fetch_recent_events(
        limit=args.limit, event_types=args.event_types
    )
    if not events:
        logger.warning(
            "No events returned — check the API key and account activity."
        )
        return

    field_rows = ingestion.extract_field_schema(events)
    mapped, unmapped = map_fields_to_data_types(field_rows)

    # Summary, same spirit as scan_remote_repo.py's compliance-style summary
    by_data_type = {}
    for row in mapped:
        by_data_type.setdefault(row["data_type"], set()).add(row["field_path"])

    print("\n=== Stripe ingestion summary ===")
    print(f"Events sampled:        {len(events)}")
    print(f"Distinct fields found: {len(field_rows)}")
    print(f"Mapped to a data type: {len(mapped)}")
    print(f"Unmapped fields:       {len(set(unmapped))}")
    print("\nBy data type:")
    for dt, fields in sorted(by_data_type.items()):
        print(f"  {dt}: {sorted(fields)}")
    if unmapped:
        print(
            "\nUnmapped (add to FIELD_TO_DATA_TYPE if these carry personal data):"
        )
        print(f"  {sorted(set(unmapped))}")

    if args.write:
        from graph.graph_writer import GraphWriter

        writer = GraphWriter()
        try:
            result = writer.write_vendor_fields(mapped)
            print(f"\nWrote to Neo4j: {result}")
        finally:
            writer.close()
    else:
        print("\n(dry run — pass --write to persist into Neo4j)")


if __name__ == "__main__":
    main()
