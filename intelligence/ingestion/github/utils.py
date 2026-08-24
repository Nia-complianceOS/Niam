"""
Shared helpers for the GitHub ingestion module: env loading, logging,
and thin GitHub REST API plumbing.

Per the onboarding doc's .env convention, all secrets are loaded from
environment variables via python-dotenv — never hardcoded.
"""

import logging
import os
from dotenv import load_dotenv, find_dotenv

load_dotenv(os.getenv("NIA_ENV_PATH", find_dotenv("../backend/.env", usecwd=True)))

GITHUB_API_BASE = "https://api.github.com"


def get_logger(name: str) -> logging.Logger:
    """Consistent, non-duplicating logger setup across the module."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s", "%H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


def github_headers(token: str = None) -> dict:
    """Standard auth headers for GitHub REST API calls."""
    token = token or os.getenv("GITHUB_TOKEN")
    if not token:
        raise EnvironmentError(
            "GITHUB_TOKEN not set. Backend provides this — add it to your .env file."
        )
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def parse_repo_full_name(repo_full_name: str) -> tuple:
    if "/" not in repo_full_name:
        raise ValueError(f"repo_full_name must be 'owner/repo', got: {repo_full_name!r}")
    owner, repo = repo_full_name.split("/", 1)
    return owner, repo
