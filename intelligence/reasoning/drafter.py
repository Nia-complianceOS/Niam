"""
reasoning/drafter.py — Gemini-based generation of remediation drafts.

TENANCY (smoke/TENANCY_CONTRACT.md). A gap id is owner-prefixed, but an
id is a guessable string and a MATCH on it alone is an authorization
check that does not exist -- so both queries below also filter on
`owner_id`, and draft_and_write_for_gap() takes it as its first argument.
Drafting somebody else's gap would read their vendor names and source
file paths INTO a Gemini prompt and write the result back onto their
graph.

:RemediationDraft itself carries no owner (contract rule 3): it is only
ever reached through the :Gap that owns it, and that Gap is filtered.
"""

import json
import logging
import os
import time
import uuid

from google import genai
from google.genai import types
from dotenv import load_dotenv, find_dotenv

from ingestion.github.classifier import (
    resolve_available_model,
    parse_retry_delay,
)
from graph.neo4j_client import Neo4jClient
from retrieval.dpdp_retrieval import DPDPRetriever
from reasoning.verifier import verify_remediation

load_dotenv(
    # NIAM_ENV_PATH is the current name; NIA_ENV_PATH is still honoured so
    # this keeps working whether or not backend/.env has been updated.
    os.getenv("NIAM_ENV_PATH")
    or os.getenv("NIA_ENV_PATH")
    or find_dotenv("../backend/.env", usecwd=True)
)
logger = logging.getLogger(__name__)

REQUESTS_PER_MINUTE = 12
MAX_OUTPUT_TOKENS = 2048
MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 5.0

_SYSTEM_PROMPT = """You are a legal privacy engineer drafting a policy amendment to resolve a compliance gap under the Digital Personal Data Protection Act, 2023 (India).
You will be provided with a JSON object describing the compliance gap: the data types involved, the vendor (if any), and the violated DPDP clauses with their summaries.
The gap object may include "remediation_path" -- the legal document this amendment will be inserted into -- and "kind":

  undisclosed_collection : the product collects this data type and the policy never says so. Write a disclosure: what is collected and why.
  undisclosed_sharing    : the data is sent to a named third party the policy does not mention. Name the recipient and say what is shared with them and for what purpose.
  ungoverned_egress / ungoverned_collection / future_obligation : coverage findings from the Act rather than the document. Draft the clause the obligation calls for.

Your amendment_markdown is INSERTED INTO the existing document, so write only the new section -- a markdown heading and its body. Do not reproduce the rest of the document, do not add a preamble, and do not write a diff.

Write plain, specific language a user could actually understand. Do not promise anything the gap does not evidence: no retention periods, no security measures, no legal bases that were not supplied to you.

Respond ONLY with a valid JSON object matching exactly this shape, and do not invent new fields:
{
  "section_title": "string (e.g., 'Third-Party Data Sharing')",
  "amendment_markdown": "string (the actual markdown text to insert)",
  "dpdp_citation": "string (which clause this resolves)",
  "confidence_score": 0.95,
  "rationale": "string (why this amendment resolves the gap)"
}
Do not include any prose outside the JSON object.
"""

_QUERY_GAP_DETAILS = """
MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
OPTIONAL MATCH (g)-[:INVOLVES]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:AFFECTS]->(v:Vendor {owner_id: $owner_id})
OPTIONAL MATCH (g)-[:VIOLATES]->(c:DPDPClause)
RETURN g.id AS gap_id,
       g.kind AS kind,
       // The document this gap is fixed in, written by the reconciler for
       // disclosure gaps. Without it a draft has no file_path, and
       // open_compliance_pr() skips every draft and opens an EMPTY pull
       // request -- a branch with no commits on it.
       g.remediation_path AS remediation_path,
       g.remediation_repo AS remediation_repo,
       collect(DISTINCT d.name) AS data_types,
       v.name AS vendor,
       collect(DISTINCT {
           clause_id: c.clause_id,
           title: c.title,
           obligation_summary: c.obligation_summary
       }) AS clauses
"""

_QUERY_WRITE_DRAFT = """
MATCH (g:Gap {id: $gap_id, owner_id: $owner_id})
MERGE (rd:RemediationDraft {id: $draft_id})
ON CREATE SET rd.section_title = $section_title,
              rd.document = $section_title,
              rd.summary = $rationale,
              rd.amendment_markdown = $amendment_markdown,
              rd.diff_text = $amendment_markdown,
              rd.dpdp_citation = $dpdp_citation,
              rd.confidence_score = $confidence_score,
              rd.rationale = $rationale,
              rd.file_path = $file_path,
              rd.status = $status,
              rd.verification_reasons = $verification_reasons,
              // "violation" | "future_obligation" | "unverified" -- see
              // reasoning/verifier.py. A draft can be verified AND a
              // future obligation; the UI needs both to say so.
              rd.classification = $classification
MERGE (g)-[:HAS_DRAFT {order: 0}]->(rd)
"""


class RemediationDrafter:
    def __init__(
        self,
        api_key: str = None,
        model: str = "auto",
        requests_per_minute: int = REQUESTS_PER_MINUTE,
        neo4j_client: Neo4jClient = None,
    ):
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise EnvironmentError(
                "GEMINI_API_KEY not set. Add it to your .env file."
            )
        self.client = genai.Client(api_key=key)
        self.model = (
            resolve_available_model(self.client) if model == "auto" else model
        )
        self.neo4j_client = neo4j_client or Neo4jClient()
        self._min_interval = 60.0 / requests_per_minute
        self._last_call_at = 0.0

    def close(self):
        self.neo4j_client.close()

    def _wait_for_rate_limit(self):
        elapsed = time.monotonic() - self._last_call_at
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_call_at = time.monotonic()

    def _draft_amendment(self, gap_details: dict) -> dict:
        prompt_input = json.dumps(gap_details, indent=2)

        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            self._wait_for_rate_limit()
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt_input,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        max_output_tokens=MAX_OUTPUT_TOKENS,
                    ),
                )
                raw = (response.text or "").strip()
                parsed = json.loads(raw)

                # validate
                required = {
                    "section_title",
                    "amendment_markdown",
                    "dpdp_citation",
                    "confidence_score",
                    "rationale",
                }
                if not required.issubset(parsed.keys()):
                    raise ValueError(
                        f"Missing required fields: {required - parsed.keys()}"
                    )

                return parsed

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
                    delay = parse_retry_delay(
                        error_str, default=BASE_BACKOFF_SECONDS * attempt
                    )
                    logger.warning("Rate limited, retrying in %.1fs...", delay)
                elif is_overloaded:
                    delay = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "Model overloaded, retrying in %.1fs...", delay
                    )
                else:
                    delay = 2.0
                    logger.warning(
                        "Drafting failed: %s — retrying in %.1fs...",
                        exc,
                        delay,
                    )
                time.sleep(delay)

        raise RuntimeError(
            f"Drafting failed after {MAX_RETRIES} attempts: {last_error}"
        )

    def draft_and_write_for_gap(self, owner_id: str, gap_id: str) -> None:
        """Draft an amendment for one gap belonging to `owner_id`.

        The owner is a per-call argument rather than constructor state:
        this drafter holds a Gemini client and a rate limiter and is
        reused across requests, and reused state is exactly how one
        request's owner ends up on another request's query.

        A gap that exists but belongs to someone else reports "not found"
        -- the same answer as a gap that does not exist, because telling
        the caller which of the two it is confirms that another account
        holds that finding.
        """
        if not owner_id:
            raise ValueError(
                "owner_id is required: drafting a gap without one either "
                "finds nothing or drafts against another account's gap"
            )
        rows = self.neo4j_client.run_read(
            _QUERY_GAP_DETAILS, {"gap_id": gap_id, "owner_id": owner_id}
        )
        if not rows:
            raise ValueError(f"Gap {gap_id} not found in graph")

        details = rows[0]
        # clean up empty clauses if any
        if details["clauses"] and not details["clauses"][0].get("clause_id"):
            details["clauses"] = []

        draft = self._draft_amendment(details)

        # Verify
        draft["dpdp_citation_clause_id"] = draft.get("dpdp_citation")
        draft["data_type"] = (
            details["data_types"][0] if details.get("data_types") else None
        )

        retriever = DPDPRetriever(self.neo4j_client)
        verif = verify_remediation(draft, retriever, owner_id)

        draft_id = f"draft-{uuid.uuid4().hex[:8]}"
        params = {
            "gap_id": gap_id,
            "owner_id": owner_id,
            "draft_id": draft_id,
            "section_title": draft.get("section_title", "Amendment"),
            "rationale": draft.get("rationale", ""),
            "amendment_markdown": draft.get("amendment_markdown", ""),
            "dpdp_citation": draft.get("dpdp_citation", ""),
            "confidence_score": float(draft.get("confidence_score", 0.0)),
            # None for gaps with no document to amend (a not-yet-commenced
            # clause is not fixed by editing a privacy policy). The PR
            # builder skips drafts without a path rather than guessing one.
            "file_path": details.get("remediation_path"),
            "status": "verified" if verif["verified"] else "needs_review",
            "verification_reasons": verif["reasons"],
            "classification": verif.get("classification", "unverified"),
        }

        self.neo4j_client.run_write(_QUERY_WRITE_DRAFT, params)
