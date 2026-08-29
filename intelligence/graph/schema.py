"""
schema.py — node/relationship vocabulary and Neo4j constraints for the
Living Compliance Graph.

Per onboarding doc Section 02 (Track 1 pipeline): this graph holds
data nodes, vendor nodes, and (once the DPDP reasoner lands) clause
nodes — one graph, no separate vector DB. This file only covers the
Track-1-ingestion slice: System / DataType / Vendor / DPDPClause labels
and the edges graph_writer.py writes.

IMPORTANT: `data_type` values written into this graph MUST come from the
same taxonomy as classifier.py's ALLOWED_DATA_TYPES. Synced below as of
the taxonomy-sync pass — if classifier.py's list ever changes, update
DATA_TYPE_TAXONOMY to match, or code-scan and vendor-scan data will
silently disagree on labels again.
"""

# --- Node labels -----------------------------------------------------

LABEL_SYSTEM = "System"  # the product/company being audited — the
# "(User)" node named in the handoff doc's
# suggested shape. Renamed here to avoid
# confusion with an actual end-user/data
# subject, which this graph does not model.
LABEL_DATA_TYPE = "DataType"
LABEL_VENDOR = "Vendor"
LABEL_DPDP_CLAUSE = "DPDPClause"  # not populated by this module — reserved
# for the retrieval/reasoner stage
LABEL_GAP = "Gap"
LABEL_REMEDIATION_DRAFT = "RemediationDraft"

# --- Relationship types ------------------------------------------------

REL_COLLECTS = "COLLECTS"  # (System)-[:COLLECTS]->(DataType)
REL_SENT_TO = "SENT_TO"  # (DataType)-[:SENT_TO]->(Vendor)
# reserved: (DataType)-[:GOVERNED_BY]->(DPDPClause)
REL_GOVERNED_BY = "GOVERNED_BY"
REL_AFFECTS = "AFFECTS"  # (Gap)-[:AFFECTS]->(Vendor)
REL_INVOLVES = "INVOLVES"  # (Gap)-[:INVOLVES]->(DataType)
REL_VIOLATES = "VIOLATES"  # (Gap)-[:VIOLATES]->(DPDPClause)
REL_HAS_DRAFT = "HAS_DRAFT"  # (Gap)-[:HAS_DRAFT]->(RemediationDraft)

# --- Data type taxonomy — synced with classifier.py's ALLOWED_DATA_TYPES
# (ingestion/github/classifier.py). Keep these two lists identical.
DATA_TYPE_TAXONOMY = {
    "email",
    "phone",
    "address",
    "date_of_birth",
    "government_id",
    "credit_card",
    "ip_address",
    "user_id",
    "username",
    "password",
    "session_token",
    "device_id",
    "location",
    "message_content",
    "search_query",
    "locale_or_language",
    "activity_timestamp",
    "consent_or_age",
    "profile_data",
    "notification_metadata",
    "internal_job_metadata",
    "other_personal_data",
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
    f"CREATE CONSTRAINT gap_id IF NOT EXISTS "
    f"FOR (g:{LABEL_GAP}) REQUIRE g.id IS UNIQUE",
]


def apply_schema(client) -> None:
    """Run once against a fresh Neo4j instance (or safely re-run anytime —
    all statements are IF NOT EXISTS)."""
    for stmt in CONSTRAINTS:
        client.run_write(stmt)
