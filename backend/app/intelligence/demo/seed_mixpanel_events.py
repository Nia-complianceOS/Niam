"""
demo/seed_mixpanel_events.py — NOT part of the real pipeline. This exists
purely to populate a fresh Mixpanel project with realistic-looking events
so you can run ingest_mixpanel.py against something real, instead of an
empty project, for a demo.

Simulates a small fictional startup ("Kirana" — a grocery delivery app;
rename the constants below to whatever story you want to tell) with a
handful of users signing up, browsing, and checking out. Uses the plain
HTTP Ingestion API (POST /track) with your project token — no service
account needed for *writing* events, only for *reading* them back out
later via ingest_mixpanel.py.

Usage:
    python demo/seed_mixpanel_events.py
"""

import json
import os
import random
import time
import uuid

import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("MIXPANEL_TOKEN")
TRACK_URL = "https://api.mixpanel.com/track"

if not TOKEN:
    raise SystemExit("MIXPANEL_TOKEN not set in .env — get it from Mixpanel Project Settings -> Access Keys.")

FAKE_USERS = [
    {"distinct_id": "user_001", "email": "aisha.k@example.com", "name": "Aisha Khan", "city": "Bengaluru"},
    {"distinct_id": "user_002", "email": "rohit.s@example.com", "name": "Rohit Sharma", "city": "Mumbai"},
    {"distinct_id": "user_003", "email": "priya.n@example.com", "name": "Priya Nair", "city": "Bengaluru"},
]

now = int(time.time())


def event(name, user, extra_props=None, minutes_ago=0):
    props = {
        "token": TOKEN,
        "distinct_id": user["distinct_id"],
        "time": now - minutes_ago * 60,
        "$insert_id": str(uuid.uuid4()),
        "email": user["email"],
        "name": user["name"],
        "city": user["city"],
    }
    if extra_props:
        props.update(extra_props)
    return {"event": name, "properties": props}


def build_events():
    events = []
    for i, user in enumerate(FAKE_USERS):
        base_offset = i * 20
        events.append(event("Signed Up", user, {"signup_method": "email"}, minutes_ago=base_offset + 60))
        events.append(event("Viewed Product", user, {"product_category": random.choice(["produce", "dairy", "snacks"])}, minutes_ago=base_offset + 40))
        events.append(event("Added to Cart", user, {"item_count": random.randint(1, 5)}, minutes_ago=base_offset + 25))
        events.append(event(
            "Purchase Completed", user,
            {"amount": round(random.uniform(150, 1200), 2), "currency": "INR", "payment_method": "upi"},
            minutes_ago=base_offset + 10,
        ))
    return events


def main():
    events = build_events()
    resp = requests.post(
        TRACK_URL,
        headers={"Content-Type": "application/json"},
        data=json.dumps(events),
    )
    print(f"Sent {len(events)} events, status {resp.status_code}: {resp.text}")
    print("Give it a minute or two, then check Mixpanel's Events view in the dashboard to confirm they landed.")


if __name__ == "__main__":
    main()
