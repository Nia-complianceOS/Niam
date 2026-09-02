"""
ingestion/vendors/stripe.py — Track 1 Week 5-6 deliverable: "Pull the
vendor's event/field schema via API and map it into graph nodes."

Stripe has no schema-introspection endpoint, so the practical approach is:
sample recent Events (GET /v1/events), and for each event look at
`data.object`'s top-level (and one-level-nested) keys. Those keys are the
"fields collected" signal that mapper.py then maps onto the DataType
taxonomy.

Uses `requests` directly against the REST API (no `stripe` SDK — not in
requirements.txt) with HTTP Basic Auth, which is how Stripe's API expects
secret-key auth: username=secret_key, password=''.

Env var: STRIPE_API_KEY (falls back to the generic VENDOR_API_KEY name
used in the onboarding doc's .env template).
"""

import logging
import os
import time

import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(
    # NIAM_ENV_PATH is the current name; NIA_ENV_PATH is still honoured so
    # this keeps working whether or not backend/.env has been updated.
    os.getenv("NIAM_ENV_PATH")
    or os.getenv("NIA_ENV_PATH")
    or find_dotenv("../backend/.env", usecwd=True)
)

logger = logging.getLogger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"
DEFAULT_EVENT_LIMIT = 100
MAX_RETRIES = 3


class StripeIngestion:
    def __init__(self, api_key: str = None):
        self.api_key = (
            api_key
            or os.getenv("STRIPE_API_KEY")
            or os.getenv("VENDOR_API_KEY")
        )
        if not self.api_key:
            raise ValueError(
                "No Stripe key found. Set STRIPE_API_KEY (or VENDOR_API_KEY) "
                "in .env — never hardcode it."
            )

    # --- fetching ---------------------------------------------------------

    def fetch_recent_events(
        self, limit: int = DEFAULT_EVENT_LIMIT, event_types: list = None
    ) -> list:
        """
        GET /v1/events, paginated via `starting_after`, capped at `limit`
        total events. `event_types` optionally restricts to specific
        Stripe event types (e.g. ["customer.created", "charge.succeeded"]);
        None fetches whatever's recent across the account.
        """
        events, starting_after = [], None

        while len(events) < limit:
            params = {"limit": min(100, limit - len(events))}
            if starting_after:
                params["starting_after"] = starting_after
            if event_types:
                params["types[]"] = event_types

            page = self._get("/events", params)
            batch = page.get("data", [])
            if not batch:
                break

            events.extend(batch)
            starting_after = batch[-1]["id"]
            if not page.get("has_more"):
                break

        logger.info("Fetched %d Stripe events", len(events))
        return events

    def _get(self, path: str, params: dict = None) -> dict:
        url = f"{STRIPE_API_BASE}{path}"
        last_err = None
        for attempt in range(1, MAX_RETRIES + 1):
            resp = requests.get(url, params=params, auth=(self.api_key, ""))
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429:
                wait = 2**attempt
                logger.warning(
                    "Stripe 429, backing off %ds (attempt %d/%d)",
                    wait,
                    attempt,
                    MAX_RETRIES,
                )
                time.sleep(wait)
                last_err = resp
                continue
            resp.raise_for_status()
        raise RuntimeError(
            f"Stripe API request failed after {MAX_RETRIES} attempts: {last_err}"
        )

    # --- schema extraction --------------------------------------------------

    def extract_field_schema(self, events: list) -> list:
        """
        Reduces a list of raw Stripe Event objects down to distinct
        (event_type, field_path) pairs — the raw material mapper.py
        turns into DataType nodes. Deliberately shallow (top-level +
        one nested level of `data.object`) — Stripe objects can nest
        deeply (e.g. `data.object.charges.data[].billing_details`), and
        going further starts re-implementing a full JSON-schema walker
        for marginal signal.
        """
        seen = set()
        rows = []

        for event in events:
            event_type = event.get("type", "unknown")
            obj = event.get("data", {}).get("object", {})

            for key, value in obj.items():
                path = key
                key_pair = (event_type, path)
                if key_pair not in seen:
                    seen.add(key_pair)
                    rows.append({"event_type": event_type, "field_path": path})

                if isinstance(value, dict):
                    for nested_key in value:
                        nested_path = f"{key}.{nested_key}"
                        nested_pair = (event_type, nested_path)
                        if nested_pair not in seen:
                            seen.add(nested_pair)
                            rows.append(
                                {
                                    "event_type": event_type,
                                    "field_path": nested_path,
                                }
                            )

        logger.info(
            "Extracted %d distinct (event_type, field_path) pairs from %d events",
            len(rows),
            len(events),
        )
        return rows
