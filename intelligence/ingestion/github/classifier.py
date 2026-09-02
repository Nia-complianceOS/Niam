"""
Stage 2 of the two-stage code scanner: an LLM classifier that turns
stage-1 keyword hits into a real yes/no on whether a line is genuine
data-handling code, plus a rough data_type / vendor guess.

Uses Google Gemini 2.5 Flash-Lite (free tier). Pinned explicitly rather
than using the "gemini-flash-latest" alias — that alias resolved to
gemini-3.5-flash in testing, which has a much stingier free-tier quota
(5 RPM) and higher 503 "high demand" rates than Flash-Lite. Check
https://ai.google.dev/gemini-api/docs/rate-limits for current numbers
before relying on any of this — Google reshuffles free-tier limits
often.
"""

import json
import os
import re
import time
from typing import List, Optional

from google import genai
from google.genai import types
from dotenv import load_dotenv, find_dotenv

from .utils import get_logger

load_dotenv(
    # NIAM_ENV_PATH is the current name; NIA_ENV_PATH is still honoured so
    # this keeps working whether or not backend/.env has been updated.
    os.getenv("NIAM_ENV_PATH")
    or os.getenv("NIA_ENV_PATH")
    or find_dotenv("../backend/.env", usecwd=True)
)
logger = get_logger(__name__)

# Pinned explicitly — do NOT use "gemini-flash-latest". That alias
# resolved to gemini-3.5-flash during testing, which only allows 5
# free-tier requests/minute and returns frequent 503s. Flash-Lite is
# the more generous, more stable free-tier option as of July 2026.
# "auto" triggers _resolve_available_model() at init time, which asks
# the Gemini API what this specific key can actually access and picks
# the best match — instead of hardcoding a model name that Google may
# restrict for this account tomorrow (as happened twice already: 2.5-flash
# and 2.5-flash-lite both 404 "no longer available to new users").
CLASSIFIER_MODEL = "auto"

# In priority order — cheapest/most-generous-free-tier first. Adjust
# this list as Google's lineup changes; the resolver just walks it top
# to bottom and uses the first one the API key is actually allowed to call.
PREFERRED_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
]

BATCH_SIZE = 8  # candidates per Gemini call
REQUESTS_PER_MINUTE = (
    12  # stays under Flash-Lite's ~15 RPM free-tier cap with headroom
)
MAX_OUTPUT_TOKENS = (
    4096  # batches of 10 were getting truncated mid-JSON at 1500
)
MAX_RETRIES = 3  # per batch, for transient 429/503 errors
BASE_BACKOFF_SECONDS = 5.0

_RETRY_DELAY_RE = re.compile(r"retry in (\d+(?:\.\d+)?)s", re.IGNORECASE)

# Fixed taxonomy the classifier must pick from — prevents the model from
# inventing near-duplicate labels (e.g. "user_id" / "user identifier" /
# "user records" all meaning the same thing), which would otherwise turn
# into a mess of near-duplicate node types once this feeds the graph.
ALLOWED_DATA_TYPES = [
    "email",
    "phone",
    "address",
    "date_of_birth",
    "government_id",  # SSN, Aadhaar, passport, PAN, etc.
    "credit_card",
    "ip_address",
    "user_id",  # any user/account identifier, incl. foreign keys to it
    "username",
    "password",
    "session_token",
    "device_id",
    "location",
    "message_content",  # DMs, posts, comments, any free-text user content
    "search_query",
    "locale_or_language",
    "activity_timestamp",  # last-seen, last-read, activity logs
    "consent_or_age",
    "profile_data",  # bio, avatar, display name, other profile fields
    "notification_metadata",
    "internal_job_metadata",  # background job/task IDs — infra, not personal data,
    # but still worth tracking as a distinct bucket
    "other_personal_data",  # genuine personal data that doesn't fit above
]

_SYSTEM_PROMPT = (
    """You are the second stage of a code scanner for a data-privacy \
compliance tool. You'll be given short code snippets that a keyword filter has \
already flagged as *possibly* touching personal data, a tracking/consent path, or \
a storage/vendor call.

For EACH snippet, decide whether it genuinely represents a data-handling code path \
(collecting, storing, transmitting, or processing personal data) — not just an \
incidental keyword match (e.g. a CSS class called "user-id-badge" is not data \
handling; a test fixture with a hardcoded fake email is borderline and should get \
low confidence rather than a hard yes/no).

When is_data_handling is true, data_type MUST be exactly one value from this fixed \
list — do not invent new labels, do not combine two values, pick the single closest \
match:
"""
    + ", ".join(ALLOWED_DATA_TYPES)
    + """

Each input snippet is prefixed with its number ("0. ", "1. ", ...). Respond with \
ONLY a JSON array containing EXACTLY ONE object per input snippet, and echo that \
snippet's number back in the "i" field so results can be matched even if the order \
changes. Never merge two snippets into one object, never split one snippet across \
two objects. Shape:
[
  {
    "i": 0,
    "is_data_handling": true,
    "data_type": "email",
    "vendor": "Stripe",
    "confidence": 0.9,
    "reasoning": "short reason, max 10 words"
  }
]
data_type must be null when is_data_handling is false, and otherwise must be one of \
the exact values listed above — never a value outside that list. vendor is free text \
(e.g. "Stripe", "Redis", "Firebase") or null if no external vendor is involved. Keep \
reasoning under 10 words. No prose outside the JSON array."""
)


def _as_dict(candidate) -> dict:
    """Normalizes a candidate to a plain dict, whether it's a
    CandidateLine object (has .to_dict()) or already a dict (e.g. from
    scan_repo_remote(classify=False))."""
    if isinstance(candidate, dict):
        return candidate
    return candidate.to_dict()


def _validate_taxonomy(parsed: List[dict]) -> None:
    """Raises ValueError if any item's data_type isn't null or one of
    ALLOWED_DATA_TYPES — the model occasionally ignores the enum
    constraint, and a retry usually gets it right. Better to retry than
    silently let near-duplicate labels back into the data."""
    allowed = set(ALLOWED_DATA_TYPES)
    for item in parsed:
        dtype = item.get("data_type")
        if dtype is not None and dtype not in allowed:
            raise ValueError(
                f"data_type {dtype!r} is not in the allowed taxonomy: {sorted(allowed)}"
            )


def _parse_retry_delay(error_str: str, default: float) -> float:
    """Gemini's 429 errors often include 'Please retry in 38.9s' — use
    that instead of guessing when we can."""
    match = _RETRY_DELAY_RE.search(error_str)
    # +1s safety margin
    return float(match.group(1)) + 1.0 if match else default


def _resolve_available_model(
    client, preferred: List[str] = PREFERRED_MODELS
) -> str:
    """Asks the Gemini API which models this key can actually call, and
    returns the first match from PREFERRED_MODELS. Falls back to any
    other flash-ish model if none of the preferred ones are available,
    since free-tier access changes without notice."""
    try:
        available = {m.name.split("/")[-1] for m in client.models.list()}
    except Exception as exc:
        logger.warning(
            "Could not list available models (%s). Falling back to %r untested — "
            "this may 404.",
            exc,
            preferred[0],
        )
        return preferred[0]

    for name in preferred:
        if name in available:
            logger.info("Using model: %s", name)
            return name

    flash_models = sorted(n for n in available if "flash" in n.lower())
    if flash_models:
        logger.warning(
            "None of the preferred models (%s) are available to this API key. "
            "Using %s instead — output quality/rate limits may differ from what "
            "this code was tuned for.",
            preferred,
            flash_models[0],
        )
        return flash_models[0]

    raise RuntimeError(
        f"No usable Gemini Flash model found for this API key. "
        f"Models available: {sorted(available) or '(none — check GEMINI_API_KEY)'}"
    )


class DataHandlingClassifier:
    """Wraps the Gemini client for stage-2 classification."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = CLASSIFIER_MODEL,
        requests_per_minute: int = REQUESTS_PER_MINUTE,
    ):
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise EnvironmentError(
                "GEMINI_API_KEY not set. Add it to your .env file."
            )
        self.client = genai.Client(api_key=key)
        self.model = (
            _resolve_available_model(self.client) if model == "auto" else model
        )
        self._min_interval = 60.0 / requests_per_minute
        self._last_call_at = 0.0

    def classify_candidates(self, candidates: List) -> List[dict]:
        """Classifies a list of candidates — either CandidateLine
        objects or plain dicts (e.g. from scan_repo_remote(classify=False)
        or anything reloaded from storage). Batched and rate-limited;
        returns each merged with its classification."""
        results = []
        total_batches = (len(candidates) + BATCH_SIZE - 1) // BATCH_SIZE
        for batch_num, start in enumerate(
            range(0, len(candidates), BATCH_SIZE), start=1
        ):
            batch = candidates[start : start + BATCH_SIZE]
            batch_dicts = [_as_dict(c) for c in batch]
            logger.info(
                "Classifying batch %d/%d (%d candidates)...",
                batch_num,
                total_batches,
                len(batch_dicts),
            )
            classifications = self._classify_batch(batch_dicts)
            for candidate_dict, classification in zip(
                batch_dicts, classifications
            ):
                merged = dict(candidate_dict)
                merged.update(classification)
                results.append(merged)
        return results

    def _wait_for_rate_limit(self):
        """Simple pacing: never fire a request sooner than
        60/requests_per_minute seconds after the last one."""
        elapsed = time.monotonic() - self._last_call_at
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call_at = time.monotonic()

    def _classify_batch(self, batch: List[dict]) -> List[dict]:
        """batch is a list of plain dicts (already normalized by
        classify_candidates via _as_dict). Retries transient failures
        (429 rate limit, 503 overloaded, truncated/invalid JSON) with
        backoff before giving up and falling back to manual review."""
        snippet_block = "\n".join(
            f"{i}. [{c['file_path']}:{c['line_number']}] {c['content'].strip()}"
            for i, c in enumerate(batch)
        )

        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._wait_for_rate_limit()
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=snippet_block,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        max_output_tokens=MAX_OUTPUT_TOKENS,
                    ),
                )
                raw = (response.text or "").strip()
                parsed = json.loads(raw)

                # Match results back to candidates by the echoed "i" index,
                # not by list position. The model occasionally returns
                # fewer objects than snippets (merging two adjacent lines,
                # or skipping one it considers uninteresting). The old
                # strict length check treated that as a protocol error and,
                # after three identical retries, threw away the ENTIRE
                # batch -- eight candidates lost because of one.
                by_index = {}
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    try:
                        by_index.setdefault(int(item.get("i")), item)
                    except (TypeError, ValueError):
                        continue

                # Fall back to positional matching only when the model
                # ignored "i" entirely AND returned the right count --
                # i.e. an older-style well-formed response.
                if not by_index and len(parsed) == len(batch):
                    by_index = dict(enumerate(parsed))

                matched = [by_index.get(i) for i in range(len(batch))]
                missing = [i for i, m in enumerate(matched) if m is None]

                if len(missing) == len(batch):
                    # Nothing usable at all -- worth a retry.
                    raise ValueError(
                        f"Classifier returned {len(parsed)} unusable results "
                        f"for {len(batch)} candidates"
                    )

                _validate_taxonomy([m for m in matched if m is not None])

                if missing:
                    # Salvage: keep what came back, mark only the gaps for
                    # review. One unclassified line should cost one line.
                    logger.warning(
                        "Classifier returned %d results for %d candidates; "
                        "keeping %d matched, marking indices %s for manual "
                        "review.",
                        len(parsed),
                        len(batch),
                        len(batch) - len(missing),
                        missing,
                    )
                    matched = [
                        m if m is not None else self._fallback()
                        for m in matched
                    ]
                return matched

            except Exception as exc:
                last_error = exc
                error_str = str(exc)
                is_rate_limited = (
                    "429" in error_str or "RESOURCE_EXHAUSTED" in error_str
                )
                is_overloaded = (
                    "503" in error_str or "UNAVAILABLE" in error_str
                )

                if attempt == MAX_RETRIES:
                    break  # out of retries, fall through to fallback below

                if is_rate_limited:
                    delay = _parse_retry_delay(
                        error_str, default=BASE_BACKOFF_SECONDS * attempt
                    )
                    logger.warning(
                        "Rate limited (attempt %d/%d), retrying in %.1fs...",
                        attempt,
                        MAX_RETRIES,
                        delay,
                    )
                elif is_overloaded:
                    delay = BASE_BACKOFF_SECONDS * (
                        2 ** (attempt - 1)
                    )  # exponential: 5s, 10s, 20s
                    logger.warning(
                        "Model overloaded (attempt %d/%d), retrying in %.1fs...",
                        attempt,
                        MAX_RETRIES,
                        delay,
                    )
                else:
                    # JSON parse errors etc — usually not worth a long wait, short retry
                    delay = 2.0
                    logger.warning(
                        "Batch failed (attempt %d/%d): %s — retrying in %.1fs...",
                        attempt,
                        MAX_RETRIES,
                        exc,
                        delay,
                    )
                time.sleep(delay)

        logger.error(
            "Classification batch failed after %d attempts, marking for manual review: %s",
            MAX_RETRIES,
            last_error,
        )
        return [self._fallback() for _ in batch]

    @staticmethod
    def _fallback() -> dict:
        return {
            "is_data_handling": None,
            "data_type": None,
            "vendor": None,
            "confidence": 0.0,
            "reasoning": "classification failed — needs manual review",
        }
