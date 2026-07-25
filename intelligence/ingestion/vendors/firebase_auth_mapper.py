"""
ingestion/vendors/firebase_auth_mapper.py — maps Firebase Auth's fixed
record fields onto the shared DataType taxonomy. Simpler than the Stripe/
Mixpanel mappers since the field vocabulary is small and fully known
(there's no open-ended custom-property space to chase) — see
firebase_auth.py's _user_to_dict for the complete field list this covers.

REPLACE the target labels below with the real classifier.ALLOWED_DATA_TYPES
values once that file is available here — same caveat as the other
mapper modules.
"""

import logging

logger = logging.getLogger(__name__)

VENDOR_NAME = "Firebase Authentication"

FIELD_TO_DATA_TYPE = {
    "uid": "user_id",
    "email": "email",
    "email_verified": "internal_job_metadata",
    "phone_number": "phone_number",
    "display_name": "profile_data",
    "photo_url": "profile_data",
    "disabled": "internal_job_metadata",
    "custom_claims": "internal_job_metadata",
    "tenant_id": "internal_job_metadata",
    "provider_ids": "internal_job_metadata",
    "creation_timestamp": "activity_timestamp",
    "last_sign_in_timestamp": "activity_timestamp",
}


def map_fields_to_data_types(field_rows: list) -> tuple:
    """
    Same (mapped, unmapped) contract as stripe_mapper / mixpanel_mapper —
    graph_writer.write_vendor_fields() is vendor-agnostic.
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
            "%d Firebase Auth field(s) had no taxonomy mapping: %s",
            len(set(unmapped)), sorted(set(unmapped)),
        )

    return mapped, unmapped
