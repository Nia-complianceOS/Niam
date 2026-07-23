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
"""

from graph.schema import REL_COLLECTS, REL_SENT_TO, LABEL_SYSTEM, LABEL_DATA_TYPE, LABEL_VENDOR


# --- COLLECTS: System -> DataType, from code-scan output ----------------

MERGE_COLLECTS_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET r.sources = [row.source_json]
ON MATCH SET r.sources = r.sources + [row.source_json]
"""

# --- SENT_TO: DataType -> Vendor, from code-scan output ------------------

MERGE_SENT_TO_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET r.sources = [row.source_json]
ON MATCH SET r.sources = r.sources + [row.source_json]
"""

# --- COLLECTS + SENT_TO from vendor ingestion (Mixpanel, Firebase, etc.) -

MERGE_COLLECTS_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET r.sources = [row.source_json]
ON MATCH SET r.sources = r.sources + [row.source_json]
"""

MERGE_SENT_TO_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET r.sources = [row.source_json]
ON MATCH SET r.sources = r.sources + [row.source_json]
"""
