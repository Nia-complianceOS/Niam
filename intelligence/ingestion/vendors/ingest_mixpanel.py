"""
ingest_mixpanel.py — CLI for the Mixpanel vendor ingestion path.

Usage:
    python ingest_mixpanel.py --days-back 14
    python ingest_mixpanel.py --days-back 14 --write         # also writes to Neo4j
    python ingest_mixpanel.py --event-names "Signed Up" "Purchase Completed"
"""

import argparse
import logging

from ingestion.vendors.mixpanel import MixpanelIngestion
from ingestion.vendors.mixpanel_mapper import map_fields_to_data_types

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Ingest Mixpanel event schema into the compliance graph")
    parser.add_argument("--days-back", type=int, default=7, help="how many days of events to sample")
    parser.add_argument("--event-names", nargs="*", default=None, help="restrict to specific Mixpanel event names")
    parser.add_argument("--limit", type=int, default=500, help="max events to parse")
    parser.add_argument("--write", action="store_true", help="write results into Neo4j (default: dry run)")
    args = parser.parse_args()

    ingestion = MixpanelIngestion()
    events = ingestion.fetch_recent_events(
        days_back=args.days_back, event_names=args.event_names, limit=args.limit
    )
    if not events:
        logger.warning(
            "No events returned — check the project ID/service account, and "
            "make sure the project has actually received tracked events in "
            "the requested date range."
        )
        return

    field_rows = ingestion.extract_field_schema(events)
    mapped, unmapped = map_fields_to_data_types(field_rows)

    by_data_type = {}
    for row in mapped:
        by_data_type.setdefault(row["data_type"], set()).add(row["field_path"])

    print("\n=== Mixpanel ingestion summary ===")
    print(f"Events sampled:        {len(events)}")
    print(f"Distinct fields found: {len(field_rows)}")
    print(f"Mapped to a data type: {len(mapped)}")
    print(f"Unmapped fields:       {len(set(unmapped))}")
    print("\nBy data type:")
    for dt, fields in sorted(by_data_type.items()):
        print(f"  {dt}: {sorted(fields)}")
    if unmapped:
        print(f"\nUnmapped (add to FIELD_TO_DATA_TYPE if these carry personal data):")
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
