"""
ingestion/vendors/mixpanel.py — Track 1 Week 5-6 vendor deliverable,
Mixpanel edition. Swapped in for Stripe because Stripe access in India
is invite-only (self-serve signup is blocked for Indian accounts as of
this writing); Mixpanel signup is fully self-serve worldwide, personal
email included. stripe.py is left in place in case an invite comes
through later — same downstream shape (vendor, data_type, event_type,
field_path), so graph_writer.py doesn't care which vendor fed it.

Uses the Raw Event Export API:
    GET https://data.mixpanel.com/api/2.0/export
        ?project_id=<PROJECT_ID>&from_date=<YYYY-MM-DD>&to_date=<YYYY-MM-DD>
    Auth: HTTP Basic, username=<service_account_username>,
          password=<service_account_secret>

Response is JSONL (one JSON object per line, NOT a JSON array) — each
line looks like:
    {"event": "Signed Up", "properties": {"distinct_id": "...", "$email": "...", "time": 123, ...}}

Service Accounts (recommended, not deprecated) are created under
Organization Settings -> Service Accounts in the Mixpanel dashboard.
That gives you a username + secret (shown once) with a role scoped to
one or more projects.

Env vars:
    MIXPANEL_SERVICE_ACCOUNT_USERNAME
    MIXPANEL_SERVICE_ACCOUNT_SECRET
    MIXPANEL_PROJECT_ID
    MIXPANEL_API_HOST   (optional — defaults to data.mixpanel.com; use
                          data-eu.mixpanel.com or the India residency host
                          if the project was created with a non-US
                          Data Residency setting)
"""

import json
import logging
import os
import time
from datetime import date, datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_API_HOST = "data.mixpanel.com"
MAX_RETRIES = 3


class MixpanelIngestion:
    def __init__(self, username: str = None, secret: str = None, project_id: str = None, api_host: str = None):
        self.username = username or os.getenv("MIXPANEL_SERVICE_ACCOUNT_USERNAME")
        self.secret = secret or os.getenv("MIXPANEL_SERVICE_ACCOUNT_SECRET")
        self.project_id = project_id or os.getenv("MIXPANEL_PROJECT_ID")
        self.api_host = api_host or os.getenv("MIXPANEL_API_HOST", DEFAULT_API_HOST)

        missing = [
            name for name, val in [
                ("MIXPANEL_SERVICE_ACCOUNT_USERNAME", self.username),
                ("MIXPANEL_SERVICE_ACCOUNT_SECRET", self.secret),
                ("MIXPANEL_PROJECT_ID", self.project_id),
            ] if not val
        ]
        if missing:
            raise ValueError(
                f"Missing Mixpanel credentials in .env: {missing}. Create a "
                f"Service Account under Organization Settings -> Service "
                f"Accounts in the Mixpanel dashboard, and find your "
                f"Project ID under Project Settings."
            )

    # --- fetching ---------------------------------------------------------

    def fetch_recent_events(self, days_back: int = 7, event_names: list = None, limit: int = 500) -> list:
        """
        Pulls raw events for the last `days_back` days via the Export API.
        `event_names` optionally restricts to specific event names (e.g.
        ["Signed Up", "Purchase Completed"]); None fetches everything.
        `limit` caps the number of parsed events returned (the API itself
        streams the full range — we stop reading once we hit `limit`).
        """
        # Use UTC, not local system time — Mixpanel evaluates from_date/
        # to_date in UTC (for projects created after Jan 1 2023). A
        # machine in a timezone ahead of UTC (e.g. IST, UTC+5:30) can
        # compute a local "today" that Mixpanel still considers "tomorrow",
        # producing a spurious "to_date cannot be later than today" 400.
        to_date = datetime.now(timezone.utc).date()
        from_date = to_date - timedelta(days=days_back)

        params = {
            "project_id": self.project_id,
            "from_date": from_date.isoformat(),
            "to_date": to_date.isoformat(),
        }
        if event_names:
            params["event"] = json.dumps(event_names)

        url = f"https://{self.api_host}/api/2.0/export"
        events = []
        last_err = None

        for attempt in range(1, MAX_RETRIES + 1):
            resp = requests.get(url, params=params, auth=(self.username, self.secret), stream=True)
            if resp.status_code == 200:
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                    if len(events) >= limit:
                        break
                break
            if resp.status_code == 429:
                wait = 2 ** attempt
                logger.warning("Mixpanel 429, backing off %ds (attempt %d/%d)", wait, attempt, MAX_RETRIES)
                time.sleep(wait)
                last_err = resp
                continue
            if 400 <= resp.status_code < 500:
                # Mixpanel's 4xx body usually explains the real cause
                # (bad project_id, service account lacks access to this
                # project, wrong data-residency host, etc.) — surface it
                # instead of a bare status code.
                raise RuntimeError(f"Mixpanel export {resp.status_code}: {resp.text}")
            resp.raise_for_status()
        else:
            raise RuntimeError(f"Mixpanel export failed after {MAX_RETRIES} attempts: {last_err}")

        logger.info("Fetched %d Mixpanel events (last %d days)", len(events), days_back)
        return events

    # --- schema extraction --------------------------------------------------

    def extract_field_schema(self, events: list) -> list:
        """
        Reduces raw Mixpanel events to distinct (event_name, field_path)
        pairs — same shallow, one-level-nested approach as stripe.py's
        extract_field_schema, for the same reason (Mixpanel `properties`
        can nest arbitrarily via custom event properties; going deeper
        chases diminishing signal for a lot more complexity).
        """
        seen = set()
        rows = []

        for event in events:
            event_name = event.get("event", "unknown")
            props = event.get("properties", {})

            for key, value in props.items():
                pair = (event_name, key)
                if pair not in seen:
                    seen.add(pair)
                    rows.append({"event_type": event_name, "field_path": key})

                if isinstance(value, dict):
                    for nested_key in value:
                        nested_path = f"{key}.{nested_key}"
                        nested_pair = (event_name, nested_path)
                        if nested_pair not in seen:
                            seen.add(nested_pair)
                            rows.append({"event_type": event_name, "field_path": nested_path})

        logger.info(
            "Extracted %d distinct (event, field_path) pairs from %d events",
            len(rows), len(events),
        )
        return rows
