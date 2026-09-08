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
MERGE (s:{LABEL_SYSTEM} {{uid: row.system_uid}})
ON CREATE SET s.name = row.system, s.owner_id = row.owner_id
ON MATCH SET  s.name = row.system, s.owner_id = row.owner_id
MERGE (d:{LABEL_DATA_TYPE} {{uid: row.data_type_uid}})
ON CREATE SET d.name = row.data_type, d.owner_id = row.owner_id
ON MATCH SET  d.name = row.data_type, d.owner_id = row.owner_id
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
MERGE (d:{LABEL_DATA_TYPE} {{uid: row.data_type_uid}})
ON CREATE SET d.name = row.data_type, d.owner_id = row.owner_id
ON MATCH SET  d.name = row.data_type, d.owner_id = row.owner_id
MERGE (v:{LABEL_VENDOR} {{uid: row.vendor_uid}})
ON CREATE SET v.name = row.vendor, v.owner_id = row.owner_id
ON MATCH SET  v.name = row.vendor, v.owner_id = row.owner_id
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
MERGE (s:{LABEL_SYSTEM} {{uid: row.system_uid}})
ON CREATE SET s.name = row.system, s.owner_id = row.owner_id
ON MATCH SET  s.name = row.system, s.owner_id = row.owner_id
MERGE (d:{LABEL_DATA_TYPE} {{uid: row.data_type_uid}})
ON CREATE SET d.name = row.data_type, d.owner_id = row.owner_id
ON MATCH SET  d.name = row.data_type, d.owner_id = row.owner_id
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
MERGE (d:{LABEL_DATA_TYPE} {{uid: row.data_type_uid}})
ON CREATE SET d.name = row.data_type, d.owner_id = row.owner_id
ON MATCH SET  d.name = row.data_type, d.owner_id = row.owner_id
MERGE (v:{LABEL_VENDOR} {{uid: row.vendor_uid}})
ON CREATE SET v.name = row.vendor, v.owner_id = row.owner_id
ON MATCH SET  v.name = row.vendor, v.owner_id = row.owner_id
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

# --- DPDPClause: shared reference data, loaded once for everyone -------
#
# The Act is the same law for every account, and extracting it costs a
# Gemini call per section, so :DPDPClause is the one label that is NOT
# owner-scoped. But :DataType now IS, which breaks the old shape: the
# loader used to write (:DataType)-[:GOVERNED_BY]->(:DPDPClause) directly,
# and there is no single :DataType named "email" any more to hang that
# edge off.
#
# So the loader records WHICH data types a clause governs as an array on
# the clause itself, and the edge is materialised per owner by
# LINK_CLAUSES_FOR_OWNER below, once that owner's data types exist. The
# alternative -- re-extracting the Act for every user who signs up --
# would spend the same quota to produce identical text.
#
# Clause properties live on the node rather than as edge provenance: a
# clause has one canonical text regardless of which data type led us to
# it, so re-detecting it via a different data type should update the
# node, not duplicate it.

MERGE_DPDP_CLAUSE = """
UNWIND $rows AS row
MERGE (c:DPDPClause {clause_id: row.clause_id})
ON CREATE SET c.section = row.section,
              c.title = row.title,
              c.obligation_summary = row.obligation_summary,
              c.effective_from = row.effective_from,
              c.status = row.status,
              c.data_types = [row.data_type]
ON MATCH SET  c.title = row.title,
              c.obligation_summary = row.obligation_summary,
              c.effective_from = row.effective_from,
              c.status = row.status,
              c.data_types = CASE
                  WHEN row.data_type IN coalesce(c.data_types, [])
                  THEN c.data_types
                  ELSE coalesce(c.data_types, []) + [row.data_type] END
"""

# Kept under the old name so nothing that imports it breaks.
MERGE_GOVERNED_BY_FROM_CLAUSE = MERGE_DPDP_CLAUSE

# Run after an owner's data types are written. Idempotent, cheap, and the
# only place GOVERNED_BY is created now.
LINK_CLAUSES_FOR_OWNER = f"""
MATCH (d:{LABEL_DATA_TYPE} {{owner_id: $owner_id}})
MATCH (c:DPDPClause)
WHERE d.name IN coalesce(c.data_types, [])
MERGE (d)-[:GOVERNED_BY]->(c)
RETURN count(*) AS linked
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
ON CREATE SET p.owner_id = row.owner_id,
              p.name = row.name,
              p.path = row.path,
              p.kind = row.kind,
              p.repo = row.repo,
              p.ref = row.ref,
              p.summary = row.summary,
              p.mentions_retention_period = row.mentions_retention_period,
              p.mentions_user_rights = row.mentions_user_rights,
              p.extraction_ok = row.extraction_ok,
              p.updated_at = row.updated_at
ON MATCH SET  p.owner_id = row.owner_id,
              p.name = row.name,
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
    UNWIND row.disclosed AS dt
    MERGE (d:{LABEL_DATA_TYPE} {{uid: dt.uid}})
    ON CREATE SET d.name = dt.name, d.owner_id = row.owner_id
    MERGE (p)-[:{REL_DISCLOSES}]->(d)
}}
CALL {{
    WITH p, row
    UNWIND row.named_recipients AS vn
    MERGE (v:{LABEL_VENDOR} {{uid: vn.uid}})
    ON CREATE SET v.name = vn.name, v.owner_id = row.owner_id
    MERGE (p)-[:{REL_NAMES_RECIPIENT}]->(v)
}}
"""
