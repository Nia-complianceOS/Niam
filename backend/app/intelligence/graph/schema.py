"""
schema.py — node/relationship vocabulary and Neo4j constraints for the
Living Compliance Graph.

Per onboarding doc Section 02 (Track 1 pipeline): this graph holds
data nodes, vendor nodes, and (once the DPDP reasoner lands) clause
nodes — one graph, no separate vector DB. This file only covers the
Track-1-ingestion slice: System / DataType / Vendor / DPDPClause labels
and the edges graph_writer.py writes.

IMPORTANT: `data_type` values written into this graph MUST come from the
same taxonomy as classifier.py's ALLOWED_DATA_TYPES. That file wasn't
available when this module was written — DATA_TYPE_TAXONOMY below is a
stand-in built from the examples in the handoff doc. Before running
ingestion against real data, replace DATA_TYPE_TAXONOMY with an import
from classifier.py so code-scan and vendor-scan data types line up.
"""

# --- Node labels -----------------------------------------------------

LABEL_SYSTEM = "System"        # the product/company being audited — the
                                # "(User)" node named in the handoff doc's
                                # suggested shape. Renamed here to avoid
                                # confusion with an actual end-user/data
                                # subject, which this graph does not model.
LABEL_DATA_TYPE = "DataType"
LABEL_VENDOR = "Vendor"
LABEL_DPDP_CLAUSE = "DPDPClause"   # not populated by this module — reserved
                                    # for the retrieval/reasoner stage

# --- Relationship types ------------------------------------------------

REL_COLLECTS = "COLLECTS"      # (System)-[:COLLECTS]->(DataType)
REL_SENT_TO = "SENT_TO"        # (DataType)-[:SENT_TO]->(Vendor)
REL_GOVERNED_BY = "GOVERNED_BY"  # reserved: (DataType)-[:GOVERNED_BY]->(DPDPClause)

# --- Placeholder taxonomy — REPLACE with classifier.py's real list -----
# Examples pulled verbatim from the handoff doc; the real list is ~21
# entries and lives in app/intelligence/ingestion/github/classifier.py
# as ALLOWED_DATA_TYPES.
DATA_TYPE_TAXONOMY = {
    "email",
    "user_id",
    "message_content",
    "locale_or_language",
    "activity_timestamp",
    "notification_metadata",
    "internal_job_metadata",
    "profile_data",
    "phone_number",
    "address",
    "payment_data",
    "device_metadata",
    "consent_record",
}

DEFAULT_SYSTEM_NAME = "nia-demo-system"  # single-system default for Track 1;
                                          # multi-repo/system support is not
                                          # needed until Track 1 scope expands


def validate_data_type(data_type: str) -> bool:
    """Guard against a classifier or mapper inventing a new label — same
    fail-closed principle classifier.py already uses for the LLM output."""
    return data_type in DATA_TYPE_TAXONOMY


# --- Constraints / indexes ---------------------------------------------

CONSTRAINTS = [
    f"CREATE CONSTRAINT system_name IF NOT EXISTS "
    f"FOR (s:{LABEL_SYSTEM}) REQUIRE s.name IS UNIQUE",

    f"CREATE CONSTRAINT data_type_name IF NOT EXISTS "
    f"FOR (d:{LABEL_DATA_TYPE}) REQUIRE d.name IS UNIQUE",

    f"CREATE CONSTRAINT vendor_name IF NOT EXISTS "
    f"FOR (v:{LABEL_VENDOR}) REQUIRE v.name IS UNIQUE",

    f"CREATE CONSTRAINT clause_id IF NOT EXISTS "
    f"FOR (c:{LABEL_DPDP_CLAUSE}) REQUIRE c.clause_id IS UNIQUE",
]


def apply_schema(client) -> None:
    """Run once against a fresh Neo4j instance (or safely re-run anytime —
    all statements are IF NOT EXISTS)."""
    for stmt in CONSTRAINTS:
        client.run_write(stmt)
