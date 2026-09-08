"""
retrieval/queries.py — Cypher query templates for the retrieval layer.

Per the onboarding doc's Section 02: plain Cypher, no vector DB — the
DPDP corpus is small enough that graph traversal is simpler and cheaper.
Every query here is read-only (run via Neo4jClient.run_read).

TENANCY (see smoke/TENANCY_CONTRACT.md). Every query below takes
`$owner_id` and filters the owned labels — :System, :DataType, :Vendor,
:PolicyDocument, :Gap — at the point each one enters the pattern. Before
this, nothing here filtered by anything, so two accounts sharing one
Neo4j instance read one merged graph: a new user was shown the previous
user's vendors, source file paths and commit SHAs. A forgotten filter
does not raise; it silently discloses another account's compliance
findings. Treat it as a data breach, not a bug.

The two exceptions, both deliberate:

  - :DPDPClause is NOT filtered. The Act is the same law for everyone,
    costs a Gemini call per section to extract, and holds nothing about
    any user. It is shared reference data, so UPCOMING_CLAUSES has no
    $owner_id parameter at all.
  - :RemediationDraft is not filtered either — it is only ever reached
    through the :Gap that owns it, and that Gap is filtered.

Where a pattern can be anchored on the user's own :System and traversed
outward that is done, but the owner filter is repeated on every owned
node in the pattern anyway. It is redundant on a correct traversal and
it is the thing that holds if a future edit changes the traversal.

Design notes that shape these queries:
  - Neo4j's aggregating functions (collect(), etc.) silently skip nulls,
    so `OPTIONAL MATCH ... collect(x)` cleanly yields an empty list
    rather than a list containing null when nothing matches — no manual
    null-filtering needed on the Cypher side.
  - `status` on a DPDPClause is either "in_force", "not_yet_commenced",
    or "unknown" (see legal/commencement.py) — most queries take an
    `include_upcoming` flag so callers can choose whether "not yet
    commenced" obligations should be treated as live right now.
  - `effective_from` is stored as an ISO date STRING ("2027-05-13"), not
    a native Neo4j date — chosen to keep node_builder.py's normalization
    simple. ISO strings still sort correctly with a plain string ORDER
    BY, which is relied on below.
"""

# --- clauses for a single DataType --------------------------------------

CLAUSES_FOR_DATA_TYPE = """
MATCH (d:DataType {owner_id: $owner_id, name: $data_type})
      -[:GOVERNED_BY]->(c:DPDPClause)
WHERE $include_upcoming OR c.status = 'in_force'
RETURN c.clause_id AS clause_id, c.section AS section, c.title AS title,
       c.obligation_summary AS obligation_summary,
       c.effective_from AS effective_from, c.status AS status
ORDER BY toInteger(c.section)
"""

# --- clauses for every DataType a System actually collects --------------
# This is the direct input builder for the DPDP Reasoner stage (Section
# 02 of the onboarding doc): "give it the data node plus the retrieved
# clauses". DataTypes with zero governing clauses still appear in the
# result (as an empty `clauses` list) rather than being silently
# dropped — a collected-but-ungoverned data type is exactly the signal
# the reconciliation engine needs later, not noise to filter out here.
#
# Anchored on the caller's own :System, so the traversal starts inside
# one account and cannot leave it; :DataType carries the filter too.

CLAUSES_FOR_SYSTEM = """
MATCH (s:System {owner_id: $owner_id, name: $system_name})
      -[:COLLECTS]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (d)-[:GOVERNED_BY]->(c:DPDPClause)
WHERE c IS NULL OR $include_upcoming OR c.status = 'in_force'
WITH d, c
ORDER BY toInteger(c.section)
RETURN d.name AS data_type, collect(c) AS clauses
ORDER BY d.name
"""

# --- coverage gaps: collected data with NO clause at all -----------------
# Kept as a low-level building block / sanity-check query, but
# DPDPRetriever.coverage_gaps() no longer calls this directly — it's
# built on clauses_for_system() instead (which accounts for general-
# purpose "other_personal_data" clauses applying to every data type),
# so the two can't drift out of sync with each other. This raw version
# only catches data types with no EXACT-NAME clause match at all.

COVERAGE_GAPS_FOR_SYSTEM = """
MATCH (s:System {owner_id: $owner_id, name: $system_name})
      -[:COLLECTS]->(d:DataType {owner_id: $owner_id})
WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause)
RETURN d.name AS data_type
ORDER BY d.name
"""

# --- vendors receiving a specific data type -------------------------------
# Used by the reconciliation engine to determine if data is actually
# exiting the system or just sitting ungoverned.

VENDORS_FOR_DATA_TYPE = """
MATCH (d:DataType {owner_id: $owner_id, name: $data_type})
      -[:SENT_TO]->(v:Vendor {owner_id: $owner_id})
RETURN collect(DISTINCT v.name) AS vendors
"""

# --- which vendors touch data governed by a specific clause --------------
# Answers "which of our vendor integrations touch data covered by this
# obligation" — e.g. point this at the consent clause and see every
# vendor receiving data that requires valid consent.
#
# The clause is shared, so it is matched unfiltered; the data types and
# vendors hanging off it are this account's alone.

VENDOR_EXPOSURE_FOR_CLAUSE = """
MATCH (c:DPDPClause {clause_id: $clause_id})
      <-[:GOVERNED_BY]-(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (d)-[:SENT_TO]->(v:Vendor {owner_id: $owner_id})
RETURN c.section AS section, c.title AS title, c.status AS status,
       d.name AS data_type, collect(DISTINCT v.name) AS vendors
ORDER BY d.name
"""

# --- full detail for one clause: governed data types + vendor exposure --
#
# `data_types_governed` is this owner's governed data types, not every
# account's — which is what makes verifier.py's GOVERNED_BY check mean
# "this clause governs data THIS account collects" rather than "somebody
# somewhere collects it".

CLAUSE_DETAIL = """
MATCH (c:DPDPClause {clause_id: $clause_id})
OPTIONAL MATCH (d:DataType {owner_id: $owner_id})-[:GOVERNED_BY]->(c)
OPTIONAL MATCH (d)-[:SENT_TO]->(v:Vendor {owner_id: $owner_id})
RETURN c.clause_id AS clause_id, c.section AS section, c.title AS title,
       c.obligation_summary AS obligation_summary,
       c.effective_from AS effective_from, c.status AS status,
       collect(DISTINCT d.name) AS data_types_governed,
       collect(DISTINCT v.name) AS vendors_exposed
"""

# --- clauses not yet in force, soonest first -----------------------------
# Useful for compliance planning ("what do we need ready by Nov 2026 vs
# May 2027") independent of any particular System/DataType.
#
# NO $owner_id: this touches only :DPDPClause, which is shared reference
# data. Adding an owner parameter that nothing filtered on would be worse
# than none — it would read like a scoped query and behave like a global
# one.

UPCOMING_CLAUSES = """
MATCH (c:DPDPClause)
WHERE c.status = 'not_yet_commenced'
RETURN DISTINCT c.clause_id AS clause_id, c.section AS section,
       c.title AS title, c.effective_from AS effective_from
ORDER BY c.effective_from, toInteger(c.section)
"""

# --- provenance behind a collected data type / an egress ------------------
# The `sources` array on COLLECTS / SENT_TO is the only record of WHERE in
# the code a data type was seen, and (since the scanner started resolving
# refs to commits) WHICH commit it was seen at. The reconciler reads it so
# a :Gap can carry a real source commit instead of none -- which is what
# gives open-pr a target repository and the audit trail something to cite.
# Entries are JSON strings; parse them caller-side.
#
# These are the queries with the sharpest disclosure edge in this file:
# `sources` carries file paths, commit SHAs and repository names from a
# private repo. Leaking one row here leaks somebody's source tree.

PROVENANCE_FOR_COLLECTION = """
MATCH (s:System {owner_id: $owner_id, name: $system_name})
      -[r:COLLECTS]->(d:DataType {owner_id: $owner_id, name: $data_type})
RETURN coalesce(r.sources, []) AS sources
"""

PROVENANCE_FOR_EGRESS = """
MATCH (d:DataType {owner_id: $owner_id, name: $data_type})
      -[r:SENT_TO]->(v:Vendor {owner_id: $owner_id, name: $vendor})
RETURN coalesce(r.sources, []) AS sources
"""

# --- lightweight graph health-check / dashboard summary ------------------

# Each count is an independent subquery on purpose. The previous version
# chained plain MATCHes -- MATCH (s:System) WITH ... MATCH (d:DataType) --
# where only the FIRST aggregation is safe over an empty label. From the
# second MATCH on there is a grouping key, so zero rows in means zero rows
# out: a single empty label (no DPDPClause nodes before the Act is loaded,
# say) made the WHOLE query return nothing, and callers reported "Graph
# unreachable" while Neo4j was perfectly healthy. A legitimately empty
# graph must read as zeros, not as an outage.
#
# COUNT {} subquery expressions (Neo4j 5.5+) rather than CALL {} scoped
# subqueries (which need 5.23+ for the CALL () form) -- this has to run on
# whatever 5.x the local container pulled as well as on Aura.
#
# `clauses` and `in_force_clauses` are deliberately NOT owner-filtered:
# they count the Act, which is one shared corpus. Every other count is
# this account's own, so a brand-new user sees zeros for their graph and
# the real size of the Act.
GRAPH_SUMMARY = """
RETURN
  COUNT { MATCH (s:System {owner_id: $owner_id}) }     AS systems,
  COUNT { MATCH (d:DataType {owner_id: $owner_id}) }   AS data_types,
  COUNT { MATCH (v:Vendor {owner_id: $owner_id}) }     AS vendors,
  COUNT { MATCH (c:DPDPClause) } AS clauses,
  COUNT { MATCH (c:DPDPClause) WHERE c.status = 'in_force' }
        AS in_force_clauses,
  COUNT { MATCH (d:DataType {owner_id: $owner_id})
          WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause) }
        AS data_types_with_no_clause
"""

# --- disclosure: what the company's own legal documents say --------------
# The other half of reconciliation. GOVERNED_BY answers "does the Act
# cover this data type"; DISCLOSES answers "have we told anyone we collect
# it". A data type can be perfectly governed and completely undisclosed,
# and that second case is both the more common real-world finding and the
# only one with a mechanical fix -- amend the document at policy.path.

POLICY_DOCUMENTS = """
MATCH (p:PolicyDocument {owner_id: $owner_id})
OPTIONAL MATCH (p)-[:DISCLOSES]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (p)-[:NAMES_RECIPIENT]->(v:Vendor {owner_id: $owner_id})
RETURN p.id AS id, p.name AS name, p.path AS path, p.kind AS kind,
       p.repo AS repo, p.summary AS summary,
       p.mentions_retention_period AS mentions_retention_period,
       p.mentions_user_rights AS mentions_user_rights,
       p.extraction_ok AS extraction_ok, p.updated_at AS updated_at,
       collect(DISTINCT d.name) AS discloses,
       collect(DISTINCT v.name) AS names_recipients
ORDER BY p.kind, p.path
"""

# Everything disclosed anywhere, across every policy document. A data type
# disclosed in the terms of service is disclosed, even if the privacy
# policy omits it.
DISCLOSED_DATA_TYPES = """
MATCH (:PolicyDocument {owner_id: $owner_id})
      -[:DISCLOSES]->(d:DataType {owner_id: $owner_id})
RETURN collect(DISTINCT d.name) AS data_types
"""

NAMED_RECIPIENTS = """
MATCH (:PolicyDocument {owner_id: $owner_id})
      -[:NAMES_RECIPIENT]->(v:Vendor {owner_id: $owner_id})
RETURN collect(DISTINCT v.name) AS vendors
"""

# Where a disclosure gap should be fixed: the privacy policy if there is
# one, otherwise whatever legal document exists. Returns nothing when the
# company has published no policy at all -- in which case the reconciler
# skips disclosure checks rather than reporting every data type as
# undisclosed.
#
# Unfiltered, this returned SOMEBODY's privacy policy to every account:
# the reconciler would then have enabled disclosure checks for a user who
# has published nothing, and pointed their remediation PR at another
# company's repository and file path.
REMEDIATION_TARGET = """
MATCH (p:PolicyDocument {owner_id: $owner_id})
RETURN p.id AS id, p.path AS path, p.repo AS repo, p.name AS name
ORDER BY CASE p.kind WHEN 'privacy_policy' THEN 0 ELSE 1 END, p.path
LIMIT 1
"""
