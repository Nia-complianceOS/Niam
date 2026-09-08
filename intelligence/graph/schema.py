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
# {uid: ...}) on a new value creates a SECOND :System node and orphans
# every COLLECTS edge hanging off the old one. Renaming it therefore
# requires either a migration Cypher on the existing graph or one fresh
# scan -- a re-scan was chosen, so delete the old :System node before the
# next scan or you will have two.
DEFAULT_SYSTEM_NAME = "niam-demo-system"


# --- Tenancy ------------------------------------------------------------
#
# Every account gets its own subgraph. Before this, nothing in the read
# path filtered by anything: graph_service ran
# `MATCH (n) WHERE n:System OR n:DataType ...` and gap_service ran
# `MATCH (g:Gap)`, so two accounts on one instance saw one merged graph
# and a brand-new user was shown the previous user's vendors.
#
# The owner is carried two ways on purpose:
#
#   owner_id   a plain property, for filtering. Indexed.
#   uid        the MERGE key, "<owner_id>:<name>". This is what makes
#              two users able to have a :Vendor called "Stripe" without
#              colliding.
#
# It is a single SCOPED KEY rather than a composite (owner_id, name)
# uniqueness constraint because composite constraints need Neo4j
# Enterprise, and the verification rig runs the Community image
# (`neo4j:5` in docker-compose.yml). A constraint that exists on Aura and
# not on the rig is worse than no constraint: it would mean the thing the
# tests prove is not the thing production enforces.
#
# :DPDPClause is deliberately NOT scoped. The Act is the same law for
# everyone, it is expensive to extract, and it holds nothing about any
# user. It is shared reference data, like the taxonomy above.

# Used when a caller genuinely has no user -- the CLIs run with
# `--owner <email-or-id>` and refuse to guess, so this only appears in
# tests and in single-tenant local experiments.
SYSTEM_OWNER = "system"


def scoped_uid(owner_id: str, name: str) -> str:
    """The MERGE key for an owned node.

    Kept in one function so the separator can never drift between the
    writer, the reconciler and the backend's read queries -- three places
    that must agree exactly or a user silently gets an empty graph.
    """
    if not owner_id:
        raise ValueError(
            "owner_id is required: an unowned node is invisible to every "
            "user and belongs to none of them"
        )
    return f"{owner_id}:{name}"


# Labels that carry owner_id + uid. :DPDPClause and :RemediationDraft are
# absent for different reasons -- the clause is shared reference data, and
# a draft is only ever reached through the :Gap that owns it.
OWNED_LABELS = (
    LABEL_SYSTEM,
    LABEL_DATA_TYPE,
    LABEL_VENDOR,
    LABEL_POLICY_DOCUMENT,
    LABEL_GAP,
)


def validate_data_type(data_type: str) -> bool:
    """Guard against a classifier or mapper inventing a new label — same
    fail-closed principle classifier.py already uses for the LLM output."""
    return data_type in DATA_TYPE_TAXONOMY


# --- Constraints / indexes ---------------------------------------------

CONSTRAINTS = [
    # Owned nodes: unique on the SCOPED uid, never on the bare name.
    # The old `REQUIRE s.name IS UNIQUE` is what made tenancy impossible
    # -- two users could not both have a :Vendor named "Stripe", so the
    # second user's scan silently merged into the first user's node.
    f"CREATE CONSTRAINT system_uid IF NOT EXISTS "
    f"FOR (s:{LABEL_SYSTEM}) REQUIRE s.uid IS UNIQUE",
    f"CREATE CONSTRAINT data_type_uid IF NOT EXISTS "
    f"FOR (d:{LABEL_DATA_TYPE}) REQUIRE d.uid IS UNIQUE",
    f"CREATE CONSTRAINT vendor_uid IF NOT EXISTS "
    f"FOR (v:{LABEL_VENDOR}) REQUIRE v.uid IS UNIQUE",
    f"CREATE CONSTRAINT policy_document_id IF NOT EXISTS "
    f"FOR (p:{LABEL_POLICY_DOCUMENT}) REQUIRE p.id IS UNIQUE",
    f"CREATE CONSTRAINT gap_id IF NOT EXISTS "
    f"FOR (g:{LABEL_GAP}) REQUIRE g.id IS UNIQUE",
    # Shared reference data -- one copy of the Act for everyone.
    f"CREATE CONSTRAINT clause_id IF NOT EXISTS "
    f"FOR (c:{LABEL_DPDP_CLAUSE}) REQUIRE c.clause_id IS UNIQUE",
    # Written by the backend rather than this package, but the schema for
    # one database belongs in one place.
    "CREATE CONSTRAINT user_id IF NOT EXISTS "
    "FOR (u:User) REQUIRE u.id IS UNIQUE",
    "CREATE CONSTRAINT user_email IF NOT EXISTS "
    "FOR (u:User) REQUIRE u.email IS UNIQUE",
    "CREATE CONSTRAINT pull_request_id IF NOT EXISTS "
    "FOR (pr:PullRequest) REQUIRE pr.id IS UNIQUE",
    "CREATE CONSTRAINT scan_id IF NOT EXISTS "
    "FOR (s:Scan) REQUIRE s.id IS UNIQUE",
    # A user's own GitHub credential (backend/app/services/
    # github_identity.py). One per account, so the scoped uid
    # "<owner_id>:github" is a natural key -- and unique on the uid, never
    # on the login, since two Niam accounts may legitimately connect the
    # same GitHub user.
    "CREATE CONSTRAINT github_connection_uid IF NOT EXISTS "
    "FOR (c:GithubConnection) REQUIRE c.uid IS UNIQUE",
    # The OAuth `state`. GET /github/oauth/callback is unauthenticated by
    # necessity (the browser arrives from github.com), so the state is
    # what identifies the user -- uniqueness here is what makes it a key
    # rather than a hint.
    "CREATE CONSTRAINT github_oauth_state IF NOT EXISTS "
    "FOR (s:GithubOAuthState) REQUIRE s.state IS UNIQUE",
]

# Every owner-scoped read filters on owner_id, so every owned label needs
# it indexed. Without these, "show me my gaps" is a full label scan that
# gets slower as other people sign up -- the classic multi-tenant
# regression where the app is fast until it has users.
INDEXES = [
    f"CREATE INDEX {label.lower()}_owner IF NOT EXISTS "
    f"FOR (n:{label}) ON (n.owner_id)"
    for label in OWNED_LABELS
] + [
    # The scan rate limiter counts a user's recent scans on every
    # POST /scan.
    "CREATE INDEX scan_user_started IF NOT EXISTS "
    "FOR (s:Scan) ON (s.user_id, s.started_at)",
    "CREATE INDEX pull_request_owner IF NOT EXISTS "
    "FOR (pr:PullRequest) ON (pr.owner_id)",
    # Every GitHub call in the backend looks the caller's connection up by
    # owner_id, so this one is on the hot path for repo listings, scans
    # and PR creation alike.
    "CREATE INDEX github_connection_owner IF NOT EXISTS "
    "FOR (c:GithubConnection) ON (c.owner_id)",
    # Expired states are purged on every /oauth/start.
    "CREATE INDEX github_oauth_state_expiry IF NOT EXISTS "
    "FOR (s:GithubOAuthState) ON (s.expires_at)",
]


def apply_schema(client) -> None:
    """Run once against a fresh Neo4j instance (or safely re-run anytime —
    all statements are IF NOT EXISTS)."""
    for stmt in CONSTRAINTS + INDEXES:
        client.run_write(stmt)
