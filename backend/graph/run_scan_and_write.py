"""
run_scan_and_write.py — closes the gap between scan_remote_repo.py and
write_graph_from_scan.py.

write_graph_from_scan.py's docstring says to run:
    python scan_remote_repo.py --json > candidates.json
    python write_graph_from_scan.py --input candidates.json

...but scan_remote_repo.py has no --json flag (it only prints a
human-readable summary to stdout). This script takes the second
documented path instead: call GitHubScanner directly and hand its
in-memory output straight to GraphWriter, no JSON round trip.

Usage:
    python -m graph.run_scan_and_write miguelgrinberg/microblog --ref main --yes

Requires GITHUB_TOKEN, GEMINI_API_KEY, and the Neo4j env vars in .env.
"""

import argparse
import sys

from graph.graph_writer import GraphWriter
from ingestion.github.classifier import BATCH_SIZE, REQUESTS_PER_MINUTE
from ingestion.github.scanner import GitHubScanner


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "repo", help="owner/repo, e.g. miguelgrinberg/microblog"
    )
    parser.add_argument(
        "--ref", default="main", help="branch or tag (default: main)"
    )
    parser.add_argument(
        "--yes", action="store_true", help="skip the confirmation prompt"
    )
    parser.add_argument(
        "--system",
        default=None,
        help="override the default system/product name",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.0,
        help="drop confirmed records below this confidence before writing (default: 0.0, keep all)",
    )
    args = parser.parse_args()

    scanner = GitHubScanner(repo_full_name=args.repo)

    print(
        f"Scanning {args.repo}@{args.ref} (stage 1 — keyword pre-filter, no API cost)..."
    )
    try:
        candidates = scanner.scan_repo_remote(ref=args.ref, classify=False)
    except Exception as exc:
        print(f"Failed to scan repo: {exc}")
        print(
            "Common causes: wrong ref (try --ref master), private repo without access, "
            "or GITHUB_TOKEN missing/invalid."
        )
        sys.exit(1)

    if not candidates:
        print("No candidate data-handling lines found. Nothing to write.")
        return

    n_calls = (len(candidates) + BATCH_SIZE - 1) // BATCH_SIZE
    est_minutes = n_calls / REQUESTS_PER_MINUTE
    print(f"\n{len(candidates)} candidate lines found across the repo.")
    print(
        f"Classifying will cost ~{n_calls} Gemini API calls "
        f"(batches of {BATCH_SIZE}), ~{est_minutes:.1f} min at {REQUESTS_PER_MINUTE} RPM."
    )

    if not args.yes:
        answer = (
            input("Proceed with classification and graph write? [y/N] ")
            .strip()
            .lower()
        )
        if answer != "y":
            print("Stopped before classifying.")
            return

    print("\nClassifying with Gemini...")
    classified = scanner.classifier.classify_candidates(candidates)

    confirmed = [c for c in classified if c.get("is_data_handling")]
    needs_review = [c for c in classified if c.get("is_data_handling") is None]
    print(
        f"\n{len(confirmed)}/{len(classified)} candidates confirmed as real data-handling code."
    )
    if needs_review:
        print(
            f"{len(needs_review)} candidates need manual review (classification failed)."
        )

    if args.min_confidence > 0.0:
        before = len(confirmed)
        confirmed = [
            c
            for c in confirmed
            if (c.get("confidence") or 0.0) >= args.min_confidence
        ]
        print(
            f"Dropped {before - len(confirmed)} below confidence {args.min_confidence}."
        )

    if not confirmed:
        print("Nothing left to write.")
        return

    # Provenance is stamped inside scan_repo_remote() now, from a resolved
    # commit -- repo, sha, message, author, branch and date. This used to
    # be done here instead, and set commit_sha to whatever was passed as
    # --ref, so a scan of "main" recorded the literal string "main" as its
    # commit. Worse, doing it here meant the OTHER caller
    # (app/services/scan_service.py, behind the Scan button) stamped
    # nothing at all.

    kwargs = {"system_name": args.system} if args.system else {}
    writer = GraphWriter(**kwargs)
    try:
        result = writer.write_classifier_output(confirmed)
    finally:
        writer.close()

    print(f"\nWrote to Neo4j: {result}")


if __name__ == "__main__":
    main()
