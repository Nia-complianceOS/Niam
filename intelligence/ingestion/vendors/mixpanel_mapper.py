"""
ingestion/vendors/mixpanel_mapper.py — maps raw Mixpanel property names
onto the shared DataType taxonomy, same role stripe_mapper.py plays for
Stripe. See that file's docstring for the general reasoning (fixed
lookup table over an LLM call, unmapped fields surface for human triage
rather than being silently guessed).

Mixpanel has two field vocabularies to cover:
  1. Reserved/default properties (prefixed with `$`, e.g. $email, $city) —
     auto-populated by Mixpanel's SDKs.
  2. Custom event properties — whatever the product team named them.
     These can't be covered exhaustively by any static table; anything
     not recognized falls through to `unmapped` for a human to triage,
     same fail-closed behavior as classifier.py's taxonomy validation.

Target labels are synced with classifier.ALLOWED_DATA_TYPES.
"""

import logging

logger = logging.getLogger(__name__)

VENDOR_NAME = "Mixpanel"

# field_path (as produced by mixpanel.py's extract_field_schema) -> data_type
FIELD_TO_DATA_TYPE = {
    # Mixpanel reserved/default properties
    "$email": "email",
    "$name": "profile_data",
    "$first_name": "profile_data",
    "$last_name": "profile_data",
    "$avatar": "profile_data",
    "$phone": "phone",
    "$city": "location",
    "$region": "location",
    "$country_code": "location",
    "distinct_id": "user_id",
    "$user_id": "user_id",
    "$device_id": "device_id",
    "$os": "device_id",
    "$browser": "device_id",
    "$browser_version": "device_id",
    "$screen_width": "device_id",
    "$screen_height": "device_id",
    "ip": "ip_address",
    "time": "activity_timestamp",
    "$insert_id": "internal_job_metadata",
    "mp_lib": "internal_job_metadata",
    "$lib_version": "internal_job_metadata",
    "$current_url": "other_personal_data",
    "$referrer": "other_personal_data",
    "$initial_referrer": "other_personal_data",
    "token": "internal_job_metadata",

    # Common custom-property names — best-effort, not exhaustive; add to
    # this table as real events surface fields not covered here.
    "email": "email",
    "user_email": "email",
    "phone_number": "phone",
    "address": "address",
    "city": "location",
    "name": "profile_data",
    "message": "message_content",
    "content": "message_content",
    "locale": "locale_or_language",
    "language": "locale_or_language",
    "consent": "consent_or_age",
    "consent_given": "consent_or_age",
}


def map_fields_to_data_types(field_rows: list) -> tuple:
    """
    field_rows: output of MixpanelIngestion.extract_field_schema() —
        [{"event_type": ..., "field_path": ...}, ...]

    Returns (mapped, unmapped), same contract as stripe_mapper's function
    of the same name so graph_writer.write_vendor_fields() doesn't need
    to know which vendor produced the rows.
    """
    mapped, unmapped = [], []

    for row in field_rows:
        field_path = row["field_path"]
        data_type = FIELD_TO_DATA_TYPE.get(field_path)

        if data_type is None:
            unmapped.append(field_path)
            continue

        mapped.append({
            "vendor": VENDOR_NAME,
            "data_type": data_type,
            "event_type": row["event_type"],
            "field_path": field_path,
        })

    if unmapped:
        logger.warning(
            "%d Mixpanel field(s) had no taxonomy mapping — not written to "
            "graph, add them to FIELD_TO_DATA_TYPE if they carry personal "
            "data: %s",
            len(set(unmapped)), sorted(set(unmapped)),
        )

    return mapped, unmapped
