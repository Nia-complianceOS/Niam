"""
GitHub scanner — Track 1 code ingestion.

Two entry points:
  - scan_diff()          incremental: candidate data-handling lines
                          introduced since a given commit. This is the
                          Week 1-2 definition of done: "given a commit
                          range, list every candidate data-handling
                          line with file and line number."
  - scan_repo()           full first-pass scan of a local working tree,
                          for the initial graph build before any diffs
                          exist to compare against.
  - scan_repo_remote()    same as scan_repo(), but pulls file contents
                          via the GitHub REST API — useful once Backend
                          hands you a repo you haven't cloned locally.

All three run the same two-stage pipeline: diff_parser's keyword
pre-filter, then classifier.py's LLM pass.
"""

import base64
import os
import subprocess
from pathlib import Path
from typing import List, Optional

import requests

from .classifier import DataHandlingClassifier
from .diff_parser import (
    CODE_FILE_EXTENSIONS,
    MAX_LINE_LENGTH,
    find_candidate_lines_in_diff,
    find_candidate_lines_in_file,
)
from .utils import GITHUB_API_BASE, get_logger, github_headers

logger = get_logger(__name__)

# Directories never worth scanning, local or remote
SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    "venv",
    "niam_env",
    "nia_env",  # pre-rename venv name; harmless to keep skipping
    "__pycache__",
    "dist",
    "build",
}

# Cost ceiling: at most this many stage-1 candidates reach the LLM per
# full-repo scan. Override with SCAN_MAX_CANDIDATES.
MAX_CANDIDATES_PER_SCAN = 400


def max_candidates_per_scan() -> int:
    """MAX_CANDIDATES_PER_SCAN, or SCAN_MAX_CANDIDATES when it is a
    positive integer. Read per call so a changed env takes effect without
    a restart. A bad value falls back to the default rather than lifting
    the ceiling."""
    raw = os.getenv("SCAN_MAX_CANDIDATES")
    if raw is None or not raw.strip():
        return MAX_CANDIDATES_PER_SCAN
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value <= 0:
        logger.warning(
            "Ignoring SCAN_MAX_CANDIDATES=%r (not a positive integer); "
            "using %d",
            raw,
            MAX_CANDIDATES_PER_SCAN,
        )
        return MAX_CANDIDATES_PER_SCAN
    return value


class GitHubScanner:
    """
    Scans a GitHub repository for code that plausibly handles personal
    data. Works against a local clone (fast, no API rate limit — used
    for diffs) and/or the GitHub REST API (for reading a remote repo
    without a local clone).
    """

    def __init__(
        self,
        repo_path: Optional[str] = None,
        repo_full_name: Optional[str] = None,
        github_token: Optional[str] = None,
        classifier: Optional[DataHandlingClassifier] = None,
        max_candidates: Optional[int] = None,
    ):
        if not repo_path and not repo_full_name:
            raise ValueError(
                "Provide repo_path (local clone) and/or repo_full_name (owner/repo)."
            )
        self.repo_path = repo_path
        self.repo_full_name = repo_full_name
        self.github_token = github_token or os.getenv("GITHUB_TOKEN")
        self.classifier = classifier or DataHandlingClassifier()
        # None -> max_candidates_per_scan() at scan time.
        self.max_candidates = max_candidates
        # Summary of the most recent scan, for callers that report
        # progress (the scan methods return only the records). Keys:
        #   candidates_found      stage-1 hits before the cap
        #   candidates_dropped    hits cut by the cap (0 if none)
        #   truncated             True when the cap cut anything
        #   max_candidates        the cap that applied (None for diffs)
        #   long_lines_skipped    lines over diff_parser.MAX_LINE_LENGTH
        #   candidates_confirmed  stage-2 data-handling count, or None
        #                         when classify=False
        self.last_scan_stats: dict = {}

    # ---------- diff-based scan (incremental) ----------

    def get_repo_diff(self, since_commit: str, until: str = "HEAD") -> str:
        """Local git diff, --unified=0 so added-line numbers are exact."""
        if not self.repo_path:
            raise ValueError("get_repo_diff requires a local repo_path.")
        result = subprocess.run(
            [
                "git",
                "-C",
                self.repo_path,
                "diff",
                since_commit,
                until,
                "--unified=0",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    def scan_diff(
        self, since_commit: str, until: str = "HEAD", classify: bool = True
    ) -> List[dict]:
        """Given a commit range, returns candidate data-handling lines
        with file + line number, optionally classified by the LLM (in
        which case only confirmed data-handling lines are returned)."""
        diff_text = self.get_repo_diff(since_commit, until)
        stats = self._new_stats()
        candidates = find_candidate_lines_in_diff(diff_text, stats=stats)
        stats["candidates_found"] = len(candidates)
        logger.info(
            "Stage 1: %d candidate lines in diff %s..%s",
            len(candidates),
            since_commit,
            until,
        )

        if not candidates:
            return []
        if not classify:
            return [c.to_dict() for c in candidates]

        return self._classify_and_log(candidates)

    # ---------- full repo scan (first pass) ----------

    def scan_repo(
        self, classify: bool = True, max_file_bytes: int = 200_000
    ) -> List[dict]:
        """Walks the local working tree and runs the two-stage pipeline
        over full file contents — used for the first graph build,
        before any commit history exists to diff against.

        Stage-1 candidates are capped (see _cap_candidates); what was cut
        is in self.last_scan_stats."""
        if not self.repo_path:
            raise ValueError(
                "scan_repo (local mode) requires repo_path. Use scan_repo_remote() otherwise."
            )

        stats = self._new_stats()
        all_candidates = []
        # Sorted so the candidate cap truncates the same files every run.
        for path in sorted(Path(self.repo_path).rglob("*")):
            if not path.is_file() or path.suffix not in CODE_FILE_EXTENSIONS:
                continue
            if SKIP_DIR_NAMES & set(path.parts):
                continue
            try:
                if path.stat().st_size > max_file_bytes:
                    continue
                content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError as exc:
                logger.warning("Skipping unreadable file %s: %s", path, exc)
                continue

            rel_path = str(path.relative_to(self.repo_path))
            all_candidates.extend(
                find_candidate_lines_in_file(rel_path, content, stats=stats)
            )

        self._log_long_lines(stats)
        logger.info(
            "Stage 1: %d candidate lines across repo", len(all_candidates)
        )
        all_candidates = self._cap_candidates(all_candidates, stats)
        if not all_candidates:
            return []
        if not classify:
            return [c.to_dict() for c in all_candidates]

        return self._classify_and_log(all_candidates)

    # ---------- remote (GitHub API) scan ----------

    def resolve_commit(self, ref: str = "main") -> dict:
        """Resolve a ref (branch, tag or sha) to the commit it points at.

        One API call, and it is what makes provenance in the graph real.
        Before this existed, `commit_sha` was set by the CLI to whatever
        the user typed as --ref -- so a graph scanned at "main" recorded
        the literal string "main" as its commit, and the API scan path
        (scan_service.run_scan) never set repo or commit_sha at all. A
        :Gap could therefore never carry a source commit, which is why
        open-pr had no target and the dashboard's remediation panel could
        not be reached.

        Returns the shape node_builder/reconciler expect. `branch` echoes
        the ref that was asked for, which is only meaningful when the ref
        WAS a branch -- it is provenance about the request, not a claim
        the commit is the branch head today.
        """
        if not self.repo_full_name:
            raise ValueError("resolve_commit requires repo_full_name.")
        headers = github_headers(self.github_token)
        owner, repo = self.repo_full_name.split("/", 1)

        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits/{ref}"
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        commit = payload.get("commit") or {}
        author = commit.get("author") or {}
        # The GitHub account, when the commit is linked to one; otherwise
        # the name from the commit object itself. Never invented.
        login = (payload.get("author") or {}).get("login")

        return {
            "repo": self.repo_full_name,
            "commit_sha": payload.get("sha") or ref,
            "commit_message": (commit.get("message") or "").split("\n")[0],
            "commit_author": login or author.get("name") or "unknown",
            "commit_branch": ref,
            "commit_committed_at": author.get("date") or "",
        }

    @staticmethod
    def _stamp_provenance(records: List[dict], commit: dict) -> List[dict]:
        """Attach the resolved commit to every candidate.

        Done here rather than in the callers because BOTH callers need it
        and only one of them ever did it: graph/run_scan_and_write.py
        stamped repo/ref by hand, and app/services/scan_service.py -- the
        path behind the Scan button in the UI -- did not.
        """
        for record in records:
            for key, value in commit.items():
                record.setdefault(key, value)
        return records

    def scan_repo_remote(
        self,
        ref: str = "main",
        classify: bool = True,
        max_file_bytes: int = 200_000,
    ) -> List[dict]:
        """Same as scan_repo(), but pulls file contents via the GitHub
        API instead of reading a local clone. Same candidate cap, same
        self.last_scan_stats."""
        if not self.repo_full_name:
            raise ValueError("scan_repo_remote requires repo_full_name.")
        headers = github_headers(self.github_token)
        owner, repo = self.repo_full_name.split("/", 1)

        # Resolve first, then read the tree AT THE RESOLVED SHA. Reading
        # the tree at a branch name and recording the sha separately would
        # let a push land between the two calls and produce provenance
        # that points at code we never actually read.
        commit = self.resolve_commit(ref)
        tree_ref = commit["commit_sha"]
        logger.info("Scanning %s at %s", self.repo_full_name, tree_ref[:12])

        tree_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{tree_ref}?recursive=1"
        resp = requests.get(tree_url, headers=headers, timeout=30)
        resp.raise_for_status()
        tree = resp.json().get("tree", [])

        stats = self._new_stats()
        all_candidates = []
        skipped_large = 0
        # Tree order (sorted by path), so the cap is deterministic.
        for entry in tree:
            if entry["type"] != "blob":
                continue
            path = entry["path"]
            if Path(path).suffix not in CODE_FILE_EXTENSIONS:
                continue
            if SKIP_DIR_NAMES & set(Path(path).parts):
                continue

            # The local scanner has capped file size since it was written;
            # this one did not, so a single vendored bundle or checked-in
            # dataset could pull megabytes through the API and into the
            # keyword pre-filter. The tree listing already carries `size`,
            # so this costs no extra request.
            if (entry.get("size") or 0) > max_file_bytes:
                skipped_large += 1
                continue

            blob_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/blobs/{entry['sha']}"
            blob_resp = requests.get(blob_url, headers=headers, timeout=30)
            blob_resp.raise_for_status()
            blob = blob_resp.json()
            if blob.get("encoding") != "base64":
                continue

            try:
                content = base64.b64decode(blob["content"]).decode(
                    "utf-8", errors="ignore"
                )
            except (ValueError, UnicodeDecodeError) as exc:
                logger.warning("Skipping undecodable file %s: %s", path, exc)
                continue

            all_candidates.extend(
                find_candidate_lines_in_file(path, content, stats=stats)
            )

        stats["files_skipped_large"] = skipped_large
        self._log_long_lines(stats)
        if skipped_large:
            logger.info(
                "Skipped %d file(s) larger than %d bytes",
                skipped_large,
                max_file_bytes,
            )
        logger.info(
            "Stage 1: %d candidate lines across remote repo",
            len(all_candidates),
        )
        all_candidates = self._cap_candidates(all_candidates, stats)
        if not all_candidates:
            return []
        if not classify:
            return self._stamp_provenance(
                [c.to_dict() for c in all_candidates], commit
            )

        return self._stamp_provenance(
            self._classify_and_log(all_candidates), commit
        )

    # ---------- shared ----------

    def _new_stats(self) -> dict:
        self.last_scan_stats = {
            "candidates_found": 0,
            "candidates_dropped": 0,
            "truncated": False,
            "max_candidates": None,
            "long_lines_skipped": 0,
            "candidates_confirmed": None,
        }
        return self.last_scan_stats

    @staticmethod
    def _log_long_lines(stats: dict) -> None:
        if stats.get("long_lines_skipped"):
            logger.info(
                "Skipped %d line(s) longer than %d chars (minified or "
                "generated code)",
                stats["long_lines_skipped"],
                MAX_LINE_LENGTH,
            )

    def _cap_candidates(self, candidates: list, stats: dict) -> list:
        """Truncate to the per-scan cap, keeping file order, and record
        what was cut in `stats` (i.e. self.last_scan_stats)."""
        limit = self.max_candidates or max_candidates_per_scan()
        found = len(candidates)
        dropped = max(0, found - limit)
        stats.update(
            candidates_found=found,
            candidates_dropped=dropped,
            truncated=dropped > 0,
            max_candidates=limit,
        )
        if dropped:
            logger.warning(
                "Candidate cap hit: %d stage-1 candidates, classifying the "
                "first %d in file order and dropping %d. Raise "
                "SCAN_MAX_CANDIDATES to classify more.",
                found,
                limit,
                dropped,
            )
        return candidates[:limit]

    def _classify_and_log(self, candidates) -> List[dict]:
        """Classify, and return ONLY the lines confirmed as data-handling.

        It used to return every classified line, so the UI scan path
        (which writes this straight to the graph) wrote lines the model
        had rejected, and ones it failed to classify. The CLIs call the
        classifier themselves and filter on their own."""
        classified = self.classifier.classify_candidates(candidates)
        kept = [c for c in classified if c.get("is_data_handling")]
        logger.info(
            "Stage 2: %d/%d candidates confirmed as data-handling",
            len(kept),
            len(candidates),
        )
        self.last_scan_stats["candidates_confirmed"] = len(kept)
        return kept
