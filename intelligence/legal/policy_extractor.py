"""
legal/policy_extractor.py — what a published legal document actually
discloses.

Same shape as ingestion/github/classifier.py and legal/dpdp_extractor.py:
one Gemini call per document, a taxonomy the model cannot invent outside
of, retries with backoff, and a fail-closed fallback.

THE FAIL DIRECTION MATTERS HERE, and it is the opposite of the code
scanner's. When the scanner is unsure it drops a candidate, so a missed
line means one fewer finding. When this extractor is unsure it must NOT
credit the document with a disclosure -- crediting one that was never
made would silently close a real gap and tell the user they are covered
when they are not. So an extraction failure yields an EMPTY disclosure
list, which surfaces as "nothing is disclosed" (loud, obviously wrong,
gets investigated) rather than "everything is fine" (quiet, plausible,
never questioned).
"""

import json
import logging
import os
import time
from typing import Dict, List

from google import genai
from google.genai import types
from graph.env import load_env

from ingestion.github.classifier import (
    ALLOWED_DATA_TYPES,
    _resolve_available_model,
    _parse_retry_delay,
)

load_env()
logger = logging.getLogger(__name__)

REQUESTS_PER_MINUTE = 12
MAX_OUTPUT_TOKENS = 2048
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 5.0

# A whole policy in one call. These documents are a few thousand words at
# most, and splitting them would lose the context that decides whether a
# sentence is a disclosure or an example.
_SYSTEM_PROMPT = (
    """You are analysing a company's published legal document (a privacy \
policy, terms of service, or similar) to determine exactly what it \
DISCLOSES to users.

Report only what the document actually says. Do not infer what a company \
like this probably collects, and do not treat a general statement such as \
"we may collect information about you" as a disclosure of any specific \
category -- that is precisely the vagueness this analysis exists to catch.

data_types_disclosed: every category the document tells the reader it \
collects, stores or processes. EVERY value must come from this fixed \
list -- do not invent labels:
"""
    + ", ".join(ALLOWED_DATA_TYPES)
    + """

vendors_named: third parties the document names explicitly as recipients \
of personal data (e.g. "Stripe", "Google Analytics"). A generic phrase \
like "our service providers" or "third parties" names nobody -- return an \
empty list for that. Free text, one entry per named organisation.

Respond with ONLY a JSON object of exactly this shape:
{
  "data_types_disclosed": ["email", "phone"],
  "vendors_named": ["Stripe"],
  "mentions_retention_period": true,
  "mentions_user_rights": true,
  "summary": "one sentence, your own words, max 25 words"
}
No prose outside the JSON object."""
)


def _validate_taxonomy(parsed: dict) -> None:
    allowed = set(ALLOWED_DATA_TYPES)
    for dtype in parsed.get("data_types_disclosed") or []:
        if dtype not in allowed:
            raise ValueError(
                f"data_type {dtype!r} is not in the allowed taxonomy"
            )


class PolicyExtractor:
    """Wraps Gemini for policy document -> disclosure extraction."""

    def __init__(
        self,
        api_key: str = None,
        model: str = "auto",
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

    def extract_all(self, documents: List[Dict]) -> List[Dict]:
        """Each document merged with its extracted disclosures."""
        results = []
        for i, doc in enumerate(documents, start=1):
            logger.info(
                "Extracting disclosures %d/%d: %s",
                i,
                len(documents),
                doc["path"],
            )
            merged = dict(doc)
            merged.update(self._extract_one(doc))
            results.append(merged)
        return results

    def _wait_for_rate_limit(self):
        elapsed = time.monotonic() - self._last_call_at
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call_at = time.monotonic()

    def _extract_one(self, doc: Dict) -> Dict:
        contents = f"DOCUMENT: {doc['path']} (kind: {doc['kind']})\n\n{doc['content']}"

        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._wait_for_rate_limit()
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        max_output_tokens=MAX_OUTPUT_TOKENS,
                    ),
                )
                parsed = json.loads((response.text or "").strip())
                if not isinstance(parsed, dict):
                    raise ValueError("expected a JSON object")
                _validate_taxonomy(parsed)

                return {
                    "data_types_disclosed": sorted(
                        set(parsed.get("data_types_disclosed") or [])
                    ),
                    "vendors_named": sorted(
                        {
                            str(v).strip()
                            for v in (parsed.get("vendors_named") or [])
                            if str(v).strip()
                        }
                    ),
                    "mentions_retention_period": bool(
                        parsed.get("mentions_retention_period")
                    ),
                    "mentions_user_rights": bool(
                        parsed.get("mentions_user_rights")
                    ),
                    "summary": str(parsed.get("summary") or "").strip(),
                    "extraction_ok": True,
                }

            except Exception as exc:
                last_error = exc
                error_str = str(exc)
                if attempt == MAX_RETRIES:
                    break
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    delay = _parse_retry_delay(
                        error_str, default=BASE_BACKOFF_SECONDS * attempt
                    )
                elif "503" in error_str or "UNAVAILABLE" in error_str:
                    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                else:
                    delay = 2.0
                logger.warning(
                    "Policy extraction failed (attempt %d/%d): %s "
                    "— retrying in %.1fs",
                    attempt,
                    MAX_RETRIES,
                    exc,
                    delay,
                )
                time.sleep(delay)

        logger.error(
            "Policy extraction failed for %s after %d attempts: %s",
            doc["path"],
            MAX_RETRIES,
            last_error,
        )
        # Empty, not absent. See the module docstring: an unreadable policy
        # must never be credited with disclosures it may not contain.
        return {
            "data_types_disclosed": [],
            "vendors_named": [],
            "mentions_retention_period": False,
            "mentions_user_rights": False,
            "summary": "extraction failed — needs manual review",
            "extraction_ok": False,
        }
