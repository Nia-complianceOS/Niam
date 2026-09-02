"""
ingestion/vendors/firebase_auth.py — second vendor for the incubator-pitch
story (Mixpanel is the hackathon-demo vendor; this one exists to show the
ingestion layer is genuinely pluggable, not a one-off). Deliberately scoped
to Firebase Authentication only — Firestore/Realtime DB have no fixed
schema to introspect, and Analytics events require BigQuery export +
billing enabled, both bigger builds than fits alongside this.

Uses the Firebase Admin SDK (`firebase-admin` — NOT in the original
requirements.txt, add it: `pip install firebase-admin`), which needs a
service account key, not a simple API key:

  Firebase Console -> Project Settings -> Service Accounts ->
  "Generate new private key" -> downloads a JSON file.

That JSON file is a credential, same handling rules as everything else in
.env — never commit it, never paste its contents into chat. Point to it
via a path, keep the actual file out of git (add to .gitignore alongside
.env).

Auth (either works):
    FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json
or, for environments where a file path is awkward (e.g. some CI/deploy
setups), the raw JSON contents as a single env var:
    FIREBASE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}

Unlike Stripe/Mixpanel, there's no "event schema" here — Auth users are a
fixed record shape. extract_field_schema() reuses the same
(event_type, field_path) output shape as the other vendor modules purely
for interface consistency with mapper/graph_writer; event_type is always
"auth_user" here since there's only one record type.
"""

import json
import logging
import os

import firebase_admin
from dotenv import load_dotenv, find_dotenv
from firebase_admin import auth as firebase_auth_module
from firebase_admin import credentials

load_dotenv(
    # NIAM_ENV_PATH is the current name; NIA_ENV_PATH is still honoured so
    # this keeps working whether or not backend/.env has been updated.
    os.getenv("NIAM_ENV_PATH")
    or os.getenv("NIA_ENV_PATH")
    or find_dotenv("../backend/.env", usecwd=True)
)

logger = logging.getLogger(__name__)

RECORD_TYPE = "auth_user"


class FirebaseAuthIngestion:
    def __init__(
        self,
        service_account_path: str = None,
        app_name: str = "niam-firebase-auth",
    ):
        cred = self._load_credentials(service_account_path)
        try:
            self._app = firebase_admin.get_app(app_name)
        except ValueError:
            self._app = firebase_admin.initialize_app(cred, name=app_name)

    @staticmethod
    def _load_credentials(service_account_path: str = None):
        path = service_account_path or os.getenv(
            "FIREBASE_SERVICE_ACCOUNT_PATH"
        )
        raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")

        if path:
            if not os.path.exists(path):
                raise ValueError(
                    f"FIREBASE_SERVICE_ACCOUNT_PATH set but file not found: {path}"
                )
            return credentials.Certificate(path)

        if raw_json:
            return credentials.Certificate(json.loads(raw_json))

        raise ValueError(
            "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_PATH "
            "(path to the downloaded service account JSON) or "
            "FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON contents) in .env. "
            "Generate the key from Firebase Console -> Project Settings -> "
            "Service Accounts -> Generate new private key."
        )

    # --- fetching ---------------------------------------------------------

    def fetch_users(self, max_results: int = 500) -> list:
        """
        Pages through Auth users via list_users(). Returns a list of dicts
        (not raw UserRecord objects) so downstream code doesn't need the
        firebase_admin SDK to consume it.
        """
        users, page = [], firebase_auth_module.list_users(app=self._app)

        while page:
            for user in page.users:
                users.append(self._user_to_dict(user))
                if len(users) >= max_results:
                    logger.info(
                        "Fetched %d Firebase Auth users (hit max_results)",
                        len(users),
                    )
                    return users
            page = page.get_next_page()

        logger.info("Fetched %d Firebase Auth users", len(users))
        return users

    @staticmethod
    def _user_to_dict(user) -> dict:
        return {
            "uid": user.uid,
            "email": user.email,
            "email_verified": user.email_verified,
            "phone_number": user.phone_number,
            "display_name": user.display_name,
            "photo_url": user.photo_url,
            "disabled": user.disabled,
            "custom_claims": user.custom_claims,
            "tenant_id": getattr(user, "tenant_id", None),
            "provider_ids": [
                p.provider_id for p in (user.provider_data or [])
            ],
            "creation_timestamp": (
                user.user_metadata.creation_timestamp
                if user.user_metadata
                else None
            ),
            "last_sign_in_timestamp": (
                user.user_metadata.last_sign_in_timestamp
                if user.user_metadata
                else None
            ),
        }

    # --- schema extraction --------------------------------------------------

    def extract_field_schema(self, users: list) -> list:
        """
        Unlike Stripe/Mixpanel, this doesn't need to discover field names —
        the Auth record shape is fixed and known (see _user_to_dict). What
        it DOES need to check is which fields are actually *populated*
        across real users, since e.g. phone_number is null for
        email/password-only signups and shouldn't be reported as collected
        if nobody in the sample has one set.
        """
        seen = set()
        rows = []

        for user in users:
            for key, value in user.items():
                if value in (None, "", [], {}):
                    continue
                if key not in seen:
                    seen.add(key)
                    rows.append({"event_type": RECORD_TYPE, "field_path": key})

        logger.info(
            "Extracted %d populated field(s) from %d Firebase Auth users",
            len(rows),
            len(users),
        )
        return rows
