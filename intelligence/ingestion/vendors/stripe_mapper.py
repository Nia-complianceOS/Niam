"""
ingestion/vendors/stripe_mapper.py — maps raw vendor field names (Stripe;
same interface should work for Firebase/Mixpanel later) onto the shared
DataType taxonomy, and shapes the result for graph_writer.write_vendor_fields().

This is the vendor-side equivalent of classifier.py's job on the code
side: turn something specific and messy (a field name) into one of the
~21 canonical data_type labels so the graph doesn't accumulate
near-duplicate DataType nodes.

Unlike the code classifier, this doesn't need an LLM call — vendor field
names are a small, fixed, well-known vocabulary per vendor, so a maintained
lookup table is more reliable and free of rate limits. Anything not in the
table is returned as unmapped rather than guessed, so it surfaces for a
human to add rather than silently mislabeling data.

Target labels are synced with classifier.ALLOWED_DATA_TYPES.
"""

import logging

logger = logging.getLogger(__name__)

VENDOR_NAME = "Stripe"

# field_path (as produced by stripe.py's extract_field_schema) -> data_type
FIELD_TO_DATA_TYPE = {
    "email": "email",
    "customer_email": "email",
    "receipt_email": "email",
    "billing_details.email": "email",
    "phone": "phone",
    "billing_details.phone": "phone",
    "address": "address",
    "billing_details.address": "address",
    "shipping": "address",
    "name": "profile_data",
    "billing_details.name": "profile_data",
    "customer": "user_id",
    "id": "user_id",
    "metadata": "internal_job_metadata",
    "created": "activity_timestamp",
    "invoice": "credit_card",
    "amount": "credit_card",
    "amount_paid": "credit_card",
    "amount_due": "credit_card",
    "currency": "credit_card",
    "card": "credit_card",
    "payment_method": "credit_card",
    "payment_method_details": "credit_card",
    "description": "message_content",
    "statement_descriptor": "message_content",
    "locale": "locale_or_language",
    "preferred_locales": "locale_or_language",
}


def map_fields_to_data_types(field_rows: list) -> tuple:
    """
    field_rows: output of StripeIngestion.extract_field_schema() —
        [{"event_type": ..., "field_path": ...}, ...]

    Returns (mapped, unmapped):
        mapped   -> list of dicts ready for graph_writer.write_vendor_fields()
                    shaped {vendor, data_type, event_type, field_path}
        unmapped -> list of field_paths with no taxonomy match, for a human
                    to triage and add to FIELD_TO_DATA_TYPE
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
            "%d Stripe field(s) had no taxonomy mapping — not written to "
            "graph, add them to FIELD_TO_DATA_TYPE if they carry personal "
            "data: %s",
            len(set(unmapped)), sorted(set(unmapped)),
        )

    return mapped, unmapped
