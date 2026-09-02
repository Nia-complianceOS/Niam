"""
legal/load_dpdp_clauses.py — one-time (or re-run-anytime) loader that
populates the graph's DPDPClause nodes and GOVERNED_BY edges.

python -m legal.load_dpdp_clauses --yes

Requires GEMINI_API_KEY and the Neo4j env vars in .env. Safe to re-run —
every write below is a MERGE (see edge_builder.MERGE_GOVERNED_BY_FROM_CLAUSE).
"""

import argparse
import json
import sys
from pathlib import Path

from graph.graph_writer import GraphWriter
from legal.dpdp_extractor import (
    BATCH_SIZE,
    REQUESTS_PER_MINUTE,
    DPDPClauseExtractor,
)
from legal.dpdp_source import fetch_act_text, split_into_sections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="ignore cache and re-fetch from source",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        help="drop data-governing sections below this confidence before writing (default: 0.0, keep all)",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="override the Act PDF source URL (default: try DPDP_ACT_PDF_URLS in order)",
    )
    args = parser.parse_args()

    cache_dir = Path(__file__).parent / ".cache"
    cache_file = cache_dir / "dpdp_clauses.json"
    extracted = None

    if cache_file.exists() and not args.refresh:
        print(f"Loading extracted clauses from cache: {cache_file}")
        with open(cache_file, "r", encoding="utf-8") as f:
            extracted = json.load(f)

    if not extracted:
        print("Fetching the DPDP Act 2023...")
        try:
            act_text = fetch_act_text(url=args.url)
            sections = split_into_sections(act_text)
        except Exception as exc:
            print(f"Failed to fetch/parse the Act: {exc}")
            sys.exit(1)

        n_calls = (len(sections) + BATCH_SIZE - 1) // BATCH_SIZE
        est_minutes = n_calls / REQUESTS_PER_MINUTE
        print(f"\n{len(sections)} sections found (sections 1-44).")
        print(
            f"Extraction will cost ~{n_calls} Gemini API calls "
            f"(batches of {BATCH_SIZE}), ~{est_minutes:.1f} min at {REQUESTS_PER_MINUTE} RPM."
        )

        if not args.yes:
            answer = (
                input("Proceed with extraction and graph write? [y/N] ")
                .strip()
                .lower()
            )
            if answer != "y":
                print("Stopped before extracting.")
                return

        print("\nExtracting clauses with Gemini...")
        extractor = DPDPClauseExtractor()
        extracted = extractor.extract_clauses(sections)

        cache_dir.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(extracted, f, indent=2)
        print(f"Saved extracted clauses to cache: {cache_file}")

    governing = [e for e in extracted if e.get("is_data_governing")]
    needs_review = [e for e in extracted if e.get("is_data_governing") is None]
    print(
        f"\n{len(governing)}/{len(extracted)} sections identified as data-governing."
    )
    if needs_review:
        print(
            f"{len(needs_review)} sections need manual review (extraction failed)."
        )

    if args.min_confidence > 0.0:
        before = len(governing)
        governing = [
            e
            for e in governing
            if (e.get("confidence") or 0.0) >= args.min_confidence
        ]
        dropped = before - len(governing)
        if dropped:
            print(f"Dropped {dropped} below confidence {args.min_confidence}.")
        # Sections dropped this way still need to reach write_dpdp_clauses
        # as non-governing so they're correctly counted, not silently lost.
        extracted = [
            e
            for e in extracted
            if e.get("is_data_governing") is not True or e in governing
        ]

    writer = GraphWriter()
    try:
        result = writer.write_dpdp_clauses(extracted)
    finally:
        writer.close()

    print(f"\nWrote to Neo4j: {result}")
    print(
        "\nNote: some clauses may carry status='not_yet_commenced' — the DPDP Act's "
        "provisions came into force in stages. See legal/commencement.py."
    )


if __name__ == "__main__":
    main()
