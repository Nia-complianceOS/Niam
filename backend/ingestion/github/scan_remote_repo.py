"""
Scan a real GitHub repo end-to-end and print a compliance-style summary
of what data-handling code was found.

Usage:
    python -m ingestion.github.scan_remote_repo <owner/repo> [--ref main] [--yes]

Always does a stage-1-only dry run first and shows you how many Gemini
calls the full classification will cost, before spending any quota.
Pass --yes to skip the confirmation prompt (for scripted runs).

Requires GITHUB_TOKEN and GEMINI_API_KEY in your .env.
"""

import argparse
import sys
from collections import Counter

from .classifier import BATCH_SIZE, REQUESTS_PER_MINUTE
from .scanner import GitHubScanner


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
    args = parser.parse_args()

    scanner = GitHubScanner(repo_full_name=args.repo)

    # --- Stage 1 only: free, fast, gives us a real cost estimate ---
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
        print("No candidate data-handling lines found. Nothing to classify.")
        return

    n_calls = (len(candidates) + BATCH_SIZE - 1) // BATCH_SIZE
    est_minutes = n_calls / REQUESTS_PER_MINUTE

    print(f"\n{len(candidates)} candidate lines found across the repo.")
    print(
        f"Classifying will cost ~{n_calls} Gemini API calls "
        f"(batches of {BATCH_SIZE}), ~{est_minutes:.1f} min at {REQUESTS_PER_MINUTE} RPM."
    )

    if not args.yes:
        answer = input("Proceed with classification? [y/N] ").strip().lower()
        if answer != "y":
            print(
                "Stopped before classifying. Re-run with --yes to skip this prompt."
            )
            return

    # --- Stage 2: classify ---
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

    if not confirmed:
        print("No confirmed data-handling code — nothing to report.")
        return

    # --- Compliance-style summary ---
    print("\n=== Data types found ===")
    data_types = Counter(
        c["data_type"] for c in confirmed if c.get("data_type")
    )
    for dtype, count in data_types.most_common():
        print(f"  {dtype}: {count} location(s)")

    print("\n=== Vendors / third parties found ===")
    vendors = Counter(c["vendor"] for c in confirmed if c.get("vendor"))
    for vendor, count in vendors.most_common():
        print(f"  {vendor}: {count} location(s)")

    print("\n=== Full findings ===")
    for c in confirmed:
        print(
            f"[{c['file_path']}:{c['line_number']}] "
            f"data_type={c.get('data_type')} vendor={c.get('vendor')} "
            f"confidence={c.get('confidence')}"
        )
        print(f"    {c['content']}")
        print(f"    -> {c['reasoning']}")

    print(
        f"\nSummary: {len(confirmed)} data-handling locations, "
        f"{len(data_types)} distinct data types, {len(vendors)} distinct vendors."
    )
    print(
        "This is a code-side inventory only — it does NOT check whether your privacy "
        "policy discloses these. That's the reconciliation step (graph vs. policy), not this scanner."
    )


if __name__ == "__main__":
    main()
