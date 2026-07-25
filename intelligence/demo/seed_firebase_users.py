"""
demo/seed_firebase_users.py — NOT part of the real pipeline. Creates a
few fake users in your Firebase Auth project so ingest_firebase_auth.py
has real data to find, same role as seed_mixpanel_events.py plays for
Mixpanel. Same fictional "Kirana" startup story — adjust as you like.

Usage:
    python demo/seed_firebase_users.py
"""

import os

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import auth, credentials

load_dotenv()

FAKE_USERS = [
    {"email": "aisha.k@example.com", "password": "Demo-Pass-001!", "display_name": "Aisha Khan", "phone_number": "+919876500001"},
    {"email": "rohit.s@example.com", "password": "Demo-Pass-002!", "display_name": "Rohit Sharma", "phone_number": "+919876500002"},
    {"email": "priya.n@example.com", "password": "Demo-Pass-003!", "display_name": "Priya Nair", "phone_number": None},
]


def main():
    path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
    if not path:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT_PATH not set in .env")

    cred = credentials.Certificate(path)
    app = firebase_admin.initialize_app(cred, name="nia-seed-script")

    created, skipped = 0, 0
    for u in FAKE_USERS:
        try:
            kwargs = {
                "email": u["email"],
                "password": u["password"],
                "display_name": u["display_name"],
                "email_verified": True,
            }
            if u["phone_number"]:
                kwargs["phone_number"] = u["phone_number"]
            record = auth.create_user(app=app, **kwargs)
            print(f"Created user: {record.uid} ({u['email']})")
            created += 1
        except auth.EmailAlreadyExistsError:
            print(f"Already exists, skipping: {u['email']}")
            skipped += 1

    print(f"\nDone. Created {created}, skipped {skipped} (already existed).")


if __name__ == "__main__":
    main()
