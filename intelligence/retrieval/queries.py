"""
retrieval/queries.py — Cypher query templates for the retrieval layer.

Per the onboarding doc's Section 02: plain Cypher, no vector DB — the
DPDP corpus is small enough that graph traversal is simpler and cheaper.
Every query here is read-only (run via Neo4jClient.run_read).

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
MATCH (d:DataType {name: $data_type})-[:GOVERNED_BY]->(c:DPDPClause)
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

CLAUSES_FOR_SYSTEM = """
MATCH (s:System {name: $system_name})-[:COLLECTS]->(d:DataType)
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
MATCH (s:System {name: $system_name})-[:COLLECTS]->(d:DataType)
WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause)
RETURN d.name AS data_type
ORDER BY d.name
"""

# --- vendors receiving a specific data type -------------------------------
# Used by the reconciliation engine to determine if data is actually
# exiting the system or just sitting ungoverned.

VENDORS_FOR_DATA_TYPE = """
MATCH (d:DataType {name: $data_type})-[:SENT_TO]->(v:Vendor)
RETURN collect(DISTINCT v.name) AS vendors
"""

# --- which vendors touch data governed by a specific clause --------------
# Answers "which of our vendor integrations touch data covered by this
# obligation" — e.g. point this at the consent clause and see every
# vendor receiving data that requires valid consent.

VENDOR_EXPOSURE_FOR_CLAUSE = """
MATCH (c:DPDPClause {clause_id: $clause_id})<-[:GOVERNED_BY]-(d:DataType)
OPTIONAL MATCH (d)-[:SENT_TO]->(v:Vendor)
RETURN c.section AS section, c.title AS title, c.status AS status,
       d.name AS data_type, collect(DISTINCT v.name) AS vendors
ORDER BY d.name
"""

# --- full detail for one clause: governed data types + vendor exposure --

CLAUSE_DETAIL = """
MATCH (c:DPDPClause {clause_id: $clause_id})
OPTIONAL MATCH (d:DataType)-[:GOVERNED_BY]->(c)
OPTIONAL MATCH (d)-[:SENT_TO]->(v:Vendor)
RETURN c.clause_id AS clause_id, c.section AS section, c.title AS title,
       c.obligation_summary AS obligation_summary,
       c.effective_from AS effective_from, c.status AS status,
       collect(DISTINCT d.name) AS data_types_governed,
       collect(DISTINCT v.name) AS vendors_exposed
"""

# --- clauses not yet in force, soonest first -----------------------------
# Useful for compliance planning ("what do we need ready by Nov 2026 vs
# May 2027") independent of any particular System/DataType.

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

PROVENANCE_FOR_COLLECTION = """
MATCH (s:System {name: $system_name})-[r:COLLECTS]->(d:DataType {name: $data_type})
RETURN coalesce(r.sources, []) AS sources
"""

PROVENANCE_FOR_EGRESS = """
MATCH (d:DataType {name: $data_type})-[r:SENT_TO]->(v:Vendor {name: $vendor})
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
GRAPH_SUMMARY = """
RETURN
  COUNT { MATCH (s:System) }     AS systems,
  COUNT { MATCH (d:DataType) }   AS data_types,
  COUNT { MATCH (v:Vendor) }     AS vendors,
  COUNT { MATCH (c:DPDPClause) } AS clauses,
  COUNT { MATCH (c:DPDPClause) WHERE c.status = 'in_force' }
        AS in_force_clauses,
  COUNT { MATCH (d:DataType)
          WHERE NOT (d)-[:GOVERNED_BY]->(:DPDPClause) }
        AS data_types_with_no_clause
"""
