"""
legal/dpdp_extractor.py — Gemini-based structured extraction of DPDP Act
sections into clause records for the graph.

Deliberately mirrors ingestion/github/classifier.py's design: same
"auto"-resolved model against PREFERRED_MODELS, same batch + rate-limit
+ retry shape, same fail-closed taxonomy validation. Reuses
classifier.py's ALLOWED_DATA_TYPES, PREFERRED_MODELS, model-resolution,
and retry-delay-parsing helpers directly rather than re-declaring them —
after the schema.py/mapper taxonomy-drift bug earlier in this project,
there should be exactly one place ALLOWED_DATA_TYPES is defined, ever.

(These are underscore-prefixed "private" helpers in classifier.py,
imported here anyway rather than duplicated. Worth promoting to a small
shared gemini_utils.py if a third Gemini-based module ever gets added.)
"""

import json
import logging
import os
import time
from typing import List, Dict

from google import genai
from google.genai import types
from dotenv import load_dotenv, find_dotenv

from ingestion.github.classifier import (
    ALLOWED_DATA_TYPES,
    _resolve_available_model,
    _parse_retry_delay,
)
from legal.commencement import status_for_section

load_dotenv(
    # NIAM_ENV_PATH is the current name; NIA_ENV_PATH is still honoured so
    # this keeps working whether or not backend/.env has been updated.
    os.getenv("NIAM_ENV_PATH")
    or os.getenv("NIA_ENV_PATH")
    or find_dotenv("../backend/.env", usecwd=True)
)
logger = logging.getLogger(__name__)

# Sections are full legal paragraphs, not one-line code snippets — much
# larger than classifier.py's per-item size, hence the smaller batch.
# Started at 4; dropped to 2 after a live run showed ~40% of batches
# miscounting results at size 4 (worse than the code scanner's ~19% at
# size 8) — denser text seems to make it easier for the model to lose
# track of how many items it's returned.
BATCH_SIZE = 2
REQUESTS_PER_MINUTE = 12
MAX_OUTPUT_TOKENS = 4096
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 5.0

_SYSTEM_PROMPT = (
    """You are structuring sections of the Digital Personal Data \
Protection Act, 2023 (India) into queryable compliance clauses for a graph \
database. You'll be given the section number, title, and full body text of \
one or more Act sections.

For EACH section, decide whether it imposes an obligation tied to specific \
categories of personal data being collected, stored, or transmitted (e.g. \
consent requirements, notice requirements, children's-data rules, cross-\
border transfer restrictions) — as opposed to a purely administrative or \
procedural provision (Board composition, appeals procedure, penalties \
machinery, rule-making powers) that doesn't govern a specific data type.

When is_data_governing is true, data_types_governed MUST be a list where \
EVERY value is exactly one from this fixed list — do not invent new labels:
"""
    + ", ".join(ALLOWED_DATA_TYPES)
    + """

Choose data_types_governed like this:

- The section singles out particular categories (e.g. children's data, \
identifiers used for a specific purpose) -> list exactly those categories, \
and nothing else.
- The section is written about personal data as such -- notice, consent, \
the rights of a Data Principal, cross-border transfer -> use \
["other_personal_data"]. Do not try to enumerate every category; the graph \
treats this as "applies to all personal data" and propagates it.
- The section applies broadly AND gives one category special treatment -> \
list that category AND "other_personal_data".

Getting this right matters: a category listed by name is reported as a \
clause that specifically governs that data, while "other_personal_data" is \
reported as a general obligation that happens to cover it. Listing a \
category the section does not actually single out overstates the finding.

Respond with ONLY a JSON array, one object per input section, in the same \
order, with exactly this shape:
[
  {
    "section": "9",
    "is_data_governing": true,
    "data_types_governed": ["consent_or_age", "profile_data"],
    "obligation_summary": "short plain-English summary in YOUR OWN WORDS, max 30 words — never copy a sentence from the input",
    "confidence": 0.9
  }
]
data_types_governed must be an empty list when is_data_governing is false. \
obligation_summary must always be your own paraphrase, never verbatim \
text from the section body. No prose outside the JSON array."""
)


def _validate_taxonomy(parsed: List[dict]) -> None:
    """Same fail-closed principle as classifier.py's _validate_taxonomy()
    — a bad label here is retried, not silently written downstream."""
    allowed = set(ALLOWED_DATA_TYPES)
    for item in parsed:
        for dtype in item.get("data_types_governed") or []:
            if dtype not in allowed:
                raise ValueError(
                    f"data_type {dtype!r} is not in the allowed taxonomy: {sorted(allowed)}"
                )


class DPDPClauseExtractor:
    """Wraps the Gemini client for DPDP section -> clause extraction."""

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

    def extract_clauses(self, sections: List[Dict]) -> List[Dict]:
        """
        sections: [{"section": "4", "title": ..., "body": ...}, ...] —
        legal.dpdp_source.split_into_sections() output.

        Returns each section merged with its extraction AND with
        effective_from/status stamped in from legal.commencement — the
        extractor doesn't need to know the commencement schedule itself,
        that's kept as a separate, easily-updated concern.
        """
        results = []
        total_batches = (len(sections) + BATCH_SIZE - 1) // BATCH_SIZE
        for batch_num, start in enumerate(
            range(0, len(sections), BATCH_SIZE), start=1
        ):
            batch = sections[start : start + BATCH_SIZE]
            logger.info(
                "Extracting batch %d/%d (%d sections)...",
                batch_num,
                total_batches,
                len(batch),
            )
            extractions = self._extract_batch(batch)
            for section_dict, extraction in zip(batch, extractions):
                merged = dict(section_dict)
                merged.update(extraction)
                commencement = status_for_section(section_dict["section"])
                merged["effective_from"] = commencement["effective_from"]
                merged["status"] = commencement["status"]
                results.append(merged)
        return results

    def _wait_for_rate_limit(self):
        elapsed = time.monotonic() - self._last_call_at
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call_at = time.monotonic()

    def _extract_batch(self, batch: List[Dict]) -> List[Dict]:
        section_block = "\n\n".join(
            f"SECTION {s['section']}: {s['title']}\n{s['body']}" for s in batch
        )

        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._wait_for_rate_limit()
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=section_block,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        max_output_tokens=MAX_OUTPUT_TOKENS,
                    ),
                )
                raw = (response.text or "").strip()
                parsed = json.loads(raw)

                # Match results back to sections BY SECTION NUMBER, not by
                # list position. The model legitimately returns more than
                # one object for a section that contains several distinct
                # provisions -- section 44 ("Amendments to certain Acts")
                # amends the TRAI, IT and RTI Acts and comes back split
                # into its constituent amendments. The old strict
                # `len(parsed) != len(batch)` check treated that as a
                # protocol error, retried the identical prompt three times,
                # and dropped both sections in the batch.
                wanted = [str(sec.get("section")) for sec in batch]
                by_section = {}
                for item in parsed:
                    key = str(item.get("section"))
                    # First object wins: for a split section the first
                    # carries the section's own title and lead provision.
                    by_section.setdefault(key, item)

                missing = [s for s in wanted if s not in by_section]
                if missing:
                    raise ValueError(
                        f"Extractor returned no result for section(s) "
                        f"{missing} (got {sorted(by_section)} for a batch of "
                        f"{len(batch)})"
                    )

                ordered = [by_section[s] for s in wanted]
                if len(parsed) != len(batch):
                    logger.info(
                        "Extractor returned %d objects for %d sections; "
                        "matched by section number (%s). Extra objects are "
                        "sub-provisions of a multi-part section.",
                        len(parsed),
                        len(batch),
                        wanted,
                    )
                _validate_taxonomy(ordered)
                return ordered

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
                    break

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
                    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "Model overloaded (attempt %d/%d), retrying in %.1fs...",
                        attempt,
                        MAX_RETRIES,
                        delay,
                    )
                else:
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
            "Extraction batch failed after %d attempts, marking for manual review: %s",
            MAX_RETRIES,
            last_error,
        )
        return [self._fallback(s["section"]) for s in batch]

    @staticmethod
    def _fallback(section: str) -> dict:
        return {
            "section": section,
            "is_data_governing": None,
            "data_types_governed": [],
            "obligation_summary": "extraction failed — needs manual review",
            "confidence": 0.0,
        }
