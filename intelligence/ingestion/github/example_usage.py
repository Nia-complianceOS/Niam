"""
Run this against your own Nia repo (per the onboarding doc's Week 1-2
instructions) to sanity-check the scanner end to end.

    python -m ingestion.github.example_usage /path/to/repo <since_commit>

Requires GEMINI_API_KEY in your .env for the stage-2 classifier.
Pass --no-classify to see raw stage-1 output only (no API key needed).
"""

import sys

from .scanner import GitHubScanner


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: python -m ingestion.github.example_usage <repo_path> <since_commit> [--no-classify]"
        )
        sys.exit(1)

    repo_path, since_commit = sys.argv[1], sys.argv[2]
    classify = "--no-classify" not in sys.argv

    scanner = GitHubScanner(repo_path=repo_path)
    results = scanner.scan_diff(since_commit, classify=classify)

    for r in results:
        flag = (
            "DATA-HANDLING"
            if r.get("is_data_handling")
            else "flagged (unconfirmed)"
        )
        print(f"[{flag}] {r['file_path']}:{r['line_number']}  {r['content']}")
        if classify:
            print(
                f"    -> data_type={r.get('data_type')} vendor={r.get('vendor')} "
                f"confidence={r.get('confidence')}  ({r.get('reasoning')})"
            )

    print(f"\n{len(results)} candidate lines total.")


if __name__ == "__main__":
    main()
