"""
write_graph_from_scan.py — CLI that closes the loop between your existing
scan_remote_repo.py output and the graph. Two ways to feed it:

    1. Pipe classifier JSON in directly:
       python scan_remote_repo.py --json > candidates.json
       python write_graph_from_scan.py --input candidates.json

    2. Import GraphWriter directly in your own script/notebook and call
       write_classifier_output(records) on whatever classify_candidates()
       returned in-memory — no JSON round trip needed.

This script only handles path (1); it doesn't call the scanner itself,
to keep this module decoupled from ingestion/github/.
"""

import argparse
import json
import logging

from graph.graph_writer import GraphWriter

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Write classifier output into the compliance graph")
    parser.add_argument("--input", required=True, help="path to a JSON file of classifier records")
    parser.add_argument("--system", default=None, help="override the default system/product name")
    args = parser.parse_args()

    with open(args.input) as f:
        records = json.load(f)

    logger.info("Loaded %d records from %s", len(records), args.input)

    kwargs = {"system_name": args.system} if args.system else {}
    writer = GraphWriter(**kwargs)
    try:
        result = writer.write_classifier_output(records)
        print(f"Result: {result}")
    finally:
        writer.close()


if __name__ == "__main__":
    main()
