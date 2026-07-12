"""
edge_builder.py — Cypher statement templates for the two Track-1 edges:

    (System)-[:COLLECTS]->(DataType)
    (DataType)-[:SENT_TO]->(Vendor)

Design choice: source provenance (file, line, confidence, event_type,
field_path, detected_at) lives as *relationship properties*, not as a
separate node per code line or per vendor field. A node-per-line design
would explode node count on any real repo scan for no query benefit —
nothing downstream (retrieval, reconciliation) needs to traverse
"line 42 of auth.py" as its own graph citizen, it just needs to know
that this DataType was collected here, with this confidence, at this time.

All statements use MERGE, never CREATE, so re-running ingestion on an
unchanged repo/vendor schema is a no-op rather than a duplicate-node
factory. Where a given (System, DataType) pair is detected at multiple
call sites, the relationship is merged once and provenance is folded
into a `sources` list rather than creating parallel edges.
"""

from graph.schema import REL_COLLECTS, REL_SENT_TO, LABEL_SYSTEM, LABEL_DATA_TYPE, LABEL_VENDOR


# --- COLLECTS: System -> DataType, from code-scan output ----------------

MERGE_COLLECTS_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET
    r.sources = [{{
        origin: 'code',
        file: row.file,
        line: row.line,
        repo: row.repo,
        commit_sha: row.commit_sha,
        confidence: row.confidence,
        detected_at: row.detected_at
    }}]
ON MATCH SET
    r.sources = r.sources + [{{
        origin: 'code',
        file: row.file,
        line: row.line,
        repo: row.repo,
        commit_sha: row.commit_sha,
        confidence: row.confidence,
        detected_at: row.detected_at
    }}]
"""

# --- SENT_TO: DataType -> Vendor, from code-scan output ------------------

MERGE_SENT_TO_FROM_CODE = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET
    r.sources = [{{
        origin: 'code',
        file: row.file,
        line: row.line,
        confidence: row.confidence,
        detected_at: row.detected_at
    }}]
ON MATCH SET
    r.sources = r.sources + [{{
        origin: 'code',
        file: row.file,
        line: row.line,
        confidence: row.confidence,
        detected_at: row.detected_at
    }}]
"""

# --- COLLECTS + SENT_TO from vendor ingestion (Stripe etc.) --------------

MERGE_COLLECTS_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (s:{LABEL_SYSTEM} {{name: row.system}})
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (s)-[r:{REL_COLLECTS}]->(d)
ON CREATE SET
    r.sources = [{{
        origin: 'vendor',
        vendor: row.vendor,
        event_type: row.event_type,
        field_path: row.field_path,
        detected_at: row.detected_at
    }}]
ON MATCH SET
    r.sources = r.sources + [{{
        origin: 'vendor',
        vendor: row.vendor,
        event_type: row.event_type,
        field_path: row.field_path,
        detected_at: row.detected_at
    }}]
"""

MERGE_SENT_TO_FROM_VENDOR = f"""
UNWIND $rows AS row
MERGE (d:{LABEL_DATA_TYPE} {{name: row.data_type}})
MERGE (v:{LABEL_VENDOR} {{name: row.vendor}})
MERGE (d)-[r:{REL_SENT_TO}]->(v)
ON CREATE SET
    r.sources = [{{
        origin: 'vendor',
        event_type: row.event_type,
        field_path: row.field_path,
        detected_at: row.detected_at
    }}]
ON MATCH SET
    r.sources = r.sources + [{{
        origin: 'vendor',
        event_type: row.event_type,
        field_path: row.field_path,
        detected_at: row.detected_at
    }}]
"""
