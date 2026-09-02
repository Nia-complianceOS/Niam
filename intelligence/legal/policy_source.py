"""
legal/policy_source.py — locate and read the company's own legal
documents.

The DPDP side of this project reads the Act. This side reads what the
company has actually published about itself: the privacy policy, the
terms of service. Without it the reconciler can only ask "does a law
govern this data type", which is a coverage question. With it, it can
also ask "have we told anyone we collect this", which is a DISCLOSURE
question -- and that is both the more common real-world finding and the
only kind with a mechanical fix, because the answer is an edit to a
specific file at a specific path.

Documents can come from a GitHub repository (the normal case: legal docs
live in the product repo, so a remediation pull request lands beside the
code that caused the gap) or from a local directory (useful for testing
without network access).
"""

import base64
import logging
import os
from pathlib import Path
from typing import List, Optional

import requests

from ingestion.github.utils import GITHUB_API_BASE, github_headers

logger = logging.getLogger(__name__)

# Filenames worth treating as legal documents. Matched case-insensitively
# against the basename, so PRIVACY_POLICY.md, privacy-policy.md and
# docs/legal/Privacy_Policy.markdown all resolve.
POLICY_FILENAME_HINTS = {
    "privacy_policy": "privacy_policy",
    "privacy-policy": "privacy_policy",
    "privacypolicy": "privacy_policy",
    "privacy": "privacy_policy",
    "terms_of_service": "terms_of_service",
    "terms-of-service": "terms_of_service",
    "termsofservice": "terms_of_service",
    "terms": "terms_of_service",
    "tos": "terms_of_service",
    "cookie_policy": "cookie_policy",
    "cookie-policy": "cookie_policy",
    "data_retention": "retention_policy",
}

POLICY_EXTENSIONS = {".md", ".markdown", ".txt", ".rst"}

# Legal documents are prose, not data files. Anything past this is either
# not a policy or needs splitting before an LLM can reason about it.
MAX_POLICY_BYTES = 300_000


def classify_policy_kind(path: str) -> Optional[str]:
    """Map a file path to a policy kind, or None if it is not one.

    Deliberately conservative: an unrecognised filename returns None
    rather than being guessed at. A document misfiled as a privacy policy
    would be reconciled against data-collection disclosures it was never
    meant to make, and every data type would read as undisclosed.
    """
    name = Path(path).name
    stem, ext = os.path.splitext(name)
    if ext.lower() not in POLICY_EXTENSIONS:
        return None
    key = stem.lower().replace(" ", "_")
    if key in POLICY_FILENAME_HINTS:
        return POLICY_FILENAME_HINTS[key]
    # Allow a prefix match so "PRIVACY_POLICY_v2" still resolves.
    for hint, kind in POLICY_FILENAME_HINTS.items():
        if key.startswith(hint):
            return kind
    return None


def load_from_directory(directory: str) -> List[dict]:
    """Read policy documents from a local directory tree."""
    documents = []
    for path in sorted(Path(directory).rglob("*")):
        if not path.is_file():
            continue
        kind = classify_policy_kind(str(path))
        if kind is None:
            continue
        if path.stat().st_size > MAX_POLICY_BYTES:
            logger.warning("Skipping oversized policy file %s", path)
            continue
        documents.append(
            {
                "path": str(path.relative_to(directory)).replace("\\", "/"),
                "kind": kind,
                "content": path.read_text(encoding="utf-8", errors="ignore"),
                "repo": None,
                "ref": None,
            }
        )
    logger.info("Found %d policy document(s) in %s", len(documents), directory)
    return documents


def load_from_repo(
    repo_full_name: str, ref: str = "main", github_token: str = None
) -> List[dict]:
    """Read policy documents from a GitHub repository at a given ref.

    Returns the same shape as load_from_directory(), plus repo/ref, so a
    remediation draft can name the exact file a pull request must edit.
    """
    headers = github_headers(github_token or os.getenv("GITHUB_TOKEN"))
    owner, repo = repo_full_name.split("/", 1)

    tree_url = (
        f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{ref}?recursive=1"
    )
    resp = requests.get(tree_url, headers=headers, timeout=30)
    resp.raise_for_status()
    tree = resp.json().get("tree", [])

    documents = []
    for entry in tree:
        if entry.get("type") != "blob":
            continue
        kind = classify_policy_kind(entry["path"])
        if kind is None:
            continue
        if (entry.get("size") or 0) > MAX_POLICY_BYTES:
            logger.warning("Skipping oversized policy file %s", entry["path"])
            continue

        blob_url = (
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/blobs/{entry['sha']}"
        )
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
            logger.warning("Skipping undecodable %s: %s", entry["path"], exc)
            continue

        documents.append(
            {
                "path": entry["path"],
                "kind": kind,
                "content": content,
                "repo": repo_full_name,
                "ref": ref,
            }
        )

    logger.info(
        "Found %d policy document(s) in %s@%s",
        len(documents),
        repo_full_name,
        ref,
    )
    return documents
