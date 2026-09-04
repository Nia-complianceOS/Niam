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
# A legal document the company actually publishes -- privacy policy, terms
# of service. Until this existed the graph knew what the code collects and
# what the Act requires, but nothing about what the company had DISCLOSED,
# so a "gap" could only ever mean "no clause governs this". With policy
# documents in the graph it can also mean "you collect this and your own
# privacy policy does not mention it", which is the more common real-world
# finding and the one that has a concrete fix: amend that document.
LABEL_POLICY_DOCUMENT = "PolicyDocument"

# --- Relationship types ------------------------------------------------

REL_COLLECTS = "COLLECTS"  # (System)-[:COLLECTS]->(DataType)
REL_SENT_TO = "SENT_TO"  # (DataType)-[:SENT_TO]->(Vendor)
# reserved: (DataType)-[:GOVERNED_BY]->(DPDPClause)
REL_GOVERNED_BY = "GOVERNED_BY"
REL_AFFECTS = "AFFECTS"  # (Gap)-[:AFFECTS]->(Vendor)
REL_INVOLVES = "INVOLVES"  # (Gap)-[:INVOLVES]->(DataType)
REL_VIOLATES = "VIOLATES"  # (Gap)-[:VIOLATES]->(DPDPClause)
REL_HAS_DRAFT = "HAS_DRAFT"  # (Gap)-[:HAS_DRAFT]->(RemediationDraft)
REL_DISCLOSES = "DISCLOSES"  # (PolicyDocument)-[:DISCLOSES]->(DataType)
# (PolicyDocument)-[:NAMES_RECIPIENT]->(Vendor)
REL_NAMES_RECIPIENT = "NAMES_RECIPIENT"
# (Gap)-[:REMEDIED_IN]->(PolicyDocument) -- the document a disclosure gap
# should be fixed in, which is what gives the drafter a file path and the
# pull request a real diff instead of an empty branch.
REL_REMEDIED_IN = "REMEDIED_IN"

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

# F3 (ACTION_PLAN.md). This is a graph KEY, not a label: MERGE (s:System
# {name: ...}) on a new value creates a SECOND :System node and orphans
# every COLLECTS edge hanging off the old one. Renaming it therefore
# requires either a migration Cypher on the existing graph or one fresh
# scan -- a re-scan was chosen, so delete the old :System node before the
# next scan or you will have two.
DEFAULT_SYSTEM_NAME = "niam-demo-system"  # single-system default for Track 1;
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
    f"CREATE CONSTRAINT policy_document_id IF NOT EXISTS "
    f"FOR (p:{LABEL_POLICY_DOCUMENT}) REQUIRE p.id IS UNIQUE",
    # :PullRequest and :Scan are written by the backend, not by this
    # package, but the schema for one database belongs in one place.
    "CREATE CONSTRAINT pull_request_id IF NOT EXISTS "
    "FOR (pr:PullRequest) REQUIRE pr.id IS UNIQUE",
    "CREATE CONSTRAINT scan_id IF NOT EXISTS "
    "FOR (s:Scan) REQUIRE s.id IS UNIQUE",
    # The scan rate limiter counts a user's recent scans on every
    # POST /scan. Without this it is a label scan on every request.
    "CREATE INDEX scan_user_started IF NOT EXISTS "
    "FOR (s:Scan) ON (s.user_id, s.started_at)",
]


def apply_schema(client) -> None:
    """Run once against a fresh Neo4j instance (or safely re-run anytime —
    all statements are IF NOT EXISTS)."""
    for stmt in CONSTRAINTS:
        client.run_write(stmt)
