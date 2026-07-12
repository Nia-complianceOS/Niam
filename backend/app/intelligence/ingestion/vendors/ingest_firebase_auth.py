"""
ingest_firebase_auth.py — CLI for the Firebase Authentication ingestion path.

Usage:
    python ingest_firebase_auth.py --max-results 200
    python ingest_firebase_auth.py --max-results 200 --write   # also writes to Neo4j
"""

import argparse
import logging

from ingestion.vendors.firebase_auth import FirebaseAuthIngestion
from ingestion.vendors.firebase_auth_mapper import map_fields_to_data_types

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Ingest Firebase Authentication user schema into the compliance graph")
    parser.add_argument("--max-results", type=int, default=500, help="max users to sample")
    parser.add_argument("--write", action="store_true", help="write results into Neo4j (default: dry run)")
    args = parser.parse_args()

    ingestion = FirebaseAuthIngestion()
    users = ingestion.fetch_users(max_results=args.max_results)
    if not users:
        logger.warning("No users returned — check the service account and that the project actually has users.")
        return

    field_rows = ingestion.extract_field_schema(users)
    mapped, unmapped = map_fields_to_data_types(field_rows)

    by_data_type = {}
    for row in mapped:
        by_data_type.setdefault(row["data_type"], set()).add(row["field_path"])

    print("\n=== Firebase Authentication ingestion summary ===")
    print(f"Users sampled:          {len(users)}")
    print(f"Distinct fields found:  {len(field_rows)}")
    print(f"Mapped to a data type:  {len(mapped)}")
    print(f"Unmapped fields:        {len(set(unmapped))}")
    print("\nBy data type:")
    for dt, fields in sorted(by_data_type.items()):
        print(f"  {dt}: {sorted(fields)}")
    if unmapped:
        print(f"\nUnmapped: {sorted(set(unmapped))}")

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
