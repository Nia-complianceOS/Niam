"""
edge_builder.py — Cypher statement templates for the two Track-1 edges:

    (System)-[:COLLECTS]->(DataType)
    (DataType)-[:SENT_TO]->(Vendor)

Design choice: source provenance (file, line, confidence, event_type,
field_path, detected_at) lives as a *relationship property* — a
`sources` array — not as a separate node per code line or per vendor
field. A node-per-line design would explode node count on any real
repo scan for no query benefit.

IMPORTANT: Neo4j property values must be primitives or arrays of
primitives — it rejects maps/objects, including arrays of maps. So each
provenance entry is JSON-serialized to a string in Python
(node_builder.py's `source_json` field) *before* it reaches Cypher, and
`sources` ends up as an array of JSON strings, not an array of objects.
Read it back with `json.loads()` on each entry.

All statements use MERGE, never CREATE, so re-running ingestion on an
unchanged repo/vendor schema is a no-op rather than a duplicate-node
factory. Where a given (System, DataType) pair is detected at multiple
call sites, the relationship is merged once and provenance is appended
to `sources` rather than creating parallel edges.

DEDUPE: appending to `sources` used to be unconditional, so scanning the
same repo five times left five identical copies of every provenance
record on every edge -- unbounded growth against an AuraDB Free node/
property budget, and a `sources` array that got slower to parse on every
run. The entries cannot be compared directly because each carries its own
`detected_at`, so node_builder.py also emits a `source_key` -- the same
observation without the timestamp (origin|file|line|commit_sha for code,
origin|vendor|event_type|field_path for vendor ingestion) -- and it is
kept alongside in a parallel `source_keys` array. An entry whose key is
already present is not appended again.

Note for edges written before this change: they have `sources` but no
`source_keys`, so the first run after upgrading appends one more entry
and seeds the key array. Every run after that is stable. If you would
rather start clean, re-scan into an empty graph.
"""

from graph.schema import (
    REL_COLLECTS,
    REL_SENT_TO,
    REL_DISCLOSES,
    REL_NAMES_RECIPIENT,
    LABEL_SYSTEM,
    LABEL_DATA_TYPE,
    LABEL_VENDOR,
    LABEL_POLICY_DOCUMENT,
)

# --- COLLECTS: System -> DataType, from code-scan output ----------------

MERGE_COLLECTS_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET r.sources = [row.source_json],
              r.source_keys = [row.source_key]
ON MATCH SET
  r.sources = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                   THEN r.sources
                   ELSE coalesce(r.sources, []) + [row.source_json] END,
  r.source_keys = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                       THEN r.source_keys
                       ELSE coalesce(r.source_keys, []) + [row.source_key] END
"""

# --- SENT_TO: DataType -> Vendor, from code-scan output ------------------

MERGE_SENT_TO_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET r.sources = [row.source_json],
              r.source_keys = [row.source_key]
ON MATCH SET
  r.sources = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                   THEN r.sources
                   ELSE coalesce(r.sources, []) + [row.source_json] END,
  r.source_keys = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                       THEN r.source_keys
                       ELSE coalesce(r.source_keys, []) + [row.source_key] END
"""

# --- COLLECTS + SENT_TO from vendor ingestion (Mixpanel, Firebase, etc.) -

MERGE_COLLECTS_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET r.sources = [row.source_json],
              r.source_keys = [row.source_key]
ON MATCH SET
  r.sources = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                   THEN r.sources
                   ELSE coalesce(r.sources, []) + [row.source_json] END,
  r.source_keys = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                       THEN r.source_keys
                       ELSE coalesce(r.source_keys, []) + [row.source_key] END
"""

MERGE_SENT_TO_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET r.sources = [row.source_json],
              r.source_keys = [row.source_key]
ON MATCH SET
  r.sources = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                   THEN r.sources
                   ELSE coalesce(r.sources, []) + [row.source_json] END,
  r.source_keys = CASE WHEN row.source_key IN coalesce(r.source_keys, [])
                       THEN r.source_keys
                       ELSE coalesce(r.source_keys, []) + [row.source_key] END
"""

# --- GOVERNED_BY: DataType -> DPDPClause, from the DPDP clause loader ----
# Unlike COLLECTS/SENT_TO, clause properties (title, obligation_summary,
# effective_from, status) live ON THE CLAUSE NODE, not as `sources`
# provenance on the relationship — a clause has one canonical text
# regardless of which data type led us to it, so re-detecting the same
# clause via a different data type should update the node, not duplicate
# or append to it. ON MATCH SET refreshes these in case the Act text or
# the commencement schedule changes between loader runs.

MERGE_GOVERNED_BY_FROM_CLAUSE = f"""
UNWIND $rows AS row
MERGE (c:DPDPClause {{clause_id: row.clause_id}})
ON CREATE SET c.section = row.section,
              c.title = row.title,
              c.obligation_summary = row.obligation_summary,
              c.effective_from = row.effective_from,
              c.status = row.status
ON MATCH SET  c.title = row.title,
              c.obligation_summary = row.obligation_summary,
              c.effective_from = row.effective_from,
              c.status = row.status
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (d)-[:GOVERNED_BY]->(c)
"""

# --- PolicyDocument: what the company has actually told users -----------
# One node per legal document, with an edge per disclosed data type and
# per explicitly named recipient. ON MATCH refreshes the scalars so a
# re-read after the document is amended updates rather than duplicates.
#
# Note the deletes: disclosures are REPLACED on every load, not merged.
# A policy that stops mentioning a data type has stopped disclosing it,
# and leaving a stale DISCLOSES edge behind would mean removing text from
# your privacy policy silently kept you "covered" for it.

MERGE_POLICY_DOCUMENT = f"""
UNWIND $rows AS row
MERGE (p:{LABEL_POLICY_DOCUMENT} {{id: row.id}})
ON CREATE SET p.name = row.name,
              p.path = row.path,
              p.kind = row.kind,
              p.repo = row.repo,
              p.ref = row.ref,
              p.summary = row.summary,
              p.mentions_retention_period = row.mentions_retention_period,
              p.mentions_user_rights = row.mentions_user_rights,
              p.extraction_ok = row.extraction_ok,
              p.updated_at = row.updated_at
ON MATCH SET  p.name = row.name,
              p.path = row.path,
              p.kind = row.kind,
              p.repo = row.repo,
              p.ref = row.ref,
              p.summary = row.summary,
              p.mentions_retention_period = row.mentions_retention_period,
              p.mentions_user_rights = row.mentions_user_rights,
              p.extraction_ok = row.extraction_ok,
              p.updated_at = row.updated_at
WITH p, row

CALL {{
    WITH p
    MATCH (p)-[old:{REL_DISCLOSES}]->(:{LABEL_DATA_TYPE})
    DELETE old
}}
CALL {{
    WITH p
    MATCH (p)-[old:{REL_NAMES_RECIPIENT}]->(:{LABEL_VENDOR})
    DELETE old
}}
WITH p, row

CALL {{
    WITH p, row
    UNWIND row.data_types_disclosed AS dt
    MERGE (d:{LABEL_DATA_TYPE} {{name: dt}})
    MERGE (p)-[:{REL_DISCLOSES}]->(d)
}}
CALL {{
    WITH p, row
    UNWIND row.vendors_named AS vn
    MERGE (v:{LABEL_VENDOR} {{name: vn}})
    MERGE (p)-[:{REL_NAMES_RECIPIENT}]->(v)
}}
"""
