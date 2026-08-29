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
    "nia_env",
    "__pycache__",
    "dist",
    "build",
}


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
    ):
        if not repo_path and not repo_full_name:
            raise ValueError(
                "Provide repo_path (local clone) and/or repo_full_name (owner/repo)."
            )
        self.repo_path = repo_path
        self.repo_full_name = repo_full_name
        self.github_token = github_token or os.getenv("GITHUB_TOKEN")
        self.classifier = classifier or DataHandlingClassifier()

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
        with file + line number, optionally classified by the LLM."""
        diff_text = self.get_repo_diff(since_commit, until)
        candidates = find_candidate_lines_in_diff(diff_text)
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
        before any commit history exists to diff against."""
        if not self.repo_path:
            raise ValueError(
                "scan_repo (local mode) requires repo_path. Use scan_repo_remote() otherwise."
            )

        all_candidates = []
        for path in Path(self.repo_path).rglob("*"):
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
                find_candidate_lines_in_file(rel_path, content)
            )

        logger.info(
            "Stage 1: %d candidate lines across repo", len(all_candidates)
        )
        if not all_candidates:
            return []
        if not classify:
            return [c.to_dict() for c in all_candidates]

        return self._classify_and_log(all_candidates)

    # ---------- remote (GitHub API) scan ----------

    def scan_repo_remote(
        self, ref: str = "main", classify: bool = True
    ) -> List[dict]:
        """Same as scan_repo(), but pulls file contents via the GitHub
        API instead of reading a local clone."""
        if not self.repo_full_name:
            raise ValueError("scan_repo_remote requires repo_full_name.")
        headers = github_headers(self.github_token)
        owner, repo = self.repo_full_name.split("/", 1)

        tree_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{ref}?recursive=1"
        resp = requests.get(tree_url, headers=headers, timeout=30)
        resp.raise_for_status()
        tree = resp.json().get("tree", [])

        all_candidates = []
        for entry in tree:
            if entry["type"] != "blob":
                continue
            path = entry["path"]
            if Path(path).suffix not in CODE_FILE_EXTENSIONS:
                continue
            if SKIP_DIR_NAMES & set(Path(path).parts):
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

            all_candidates.extend(find_candidate_lines_in_file(path, content))

        logger.info(
            "Stage 1: %d candidate lines across remote repo",
            len(all_candidates),
        )
        if not all_candidates:
            return []
        if not classify:
            return [c.to_dict() for c in all_candidates]

        return self._classify_and_log(all_candidates)

    # ---------- shared ----------

    def _classify_and_log(self, candidates) -> List[dict]:
        classified = self.classifier.classify_candidates(candidates)
        kept = [c for c in classified if c.get("is_data_handling")]
        logger.info(
            "Stage 2: %d/%d candidates confirmed as data-handling",
            len(kept),
            len(candidates),
        )
        return classified
