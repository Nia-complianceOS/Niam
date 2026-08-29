"""
reconciler.py — The core engine that compares detected data types and their vendors
against the DPDP Act clauses to derive compliance gaps and write them into the graph.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from graph.neo4j_client import Neo4jClient
from graph.schema import DEFAULT_SYSTEM_NAME
from retrieval.dpdp_retrieval import DPDPRetriever
from retrieval.queries import VENDORS_FOR_DATA_TYPE

logger = logging.getLogger(__name__)


def classify_gap(
    vendors: list, clauses: list
) -> tuple[str | None, str | None]:
    """
    Pure function to classify a gap based on vendors and clauses.
    Returns (severity, kind) or (None, None) if no gap.
    """
    has_vendors = len(vendors) > 0
    has_clauses = len(clauses) > 0
    has_in_force_clauses = any(c["status"] == "in_force" for c in clauses)

    if has_vendors and not has_clauses:
        return "high", "ungoverned_egress"
    elif has_vendors and has_clauses and not has_in_force_clauses:
        return "medium", "future_obligation"
    elif not has_vendors and not has_clauses:
        return "low", "ungoverned_collection"

    return None, None


MERGE_GAP = """
MERGE (g:Gap {id: $id})
ON CREATE SET g.title = $title,
              g.status = $status,
              g.severity = $severity,
              g.kind = $kind,
              g.ai_recommendation = $ai_recommendation,
              g.detected_at = $now,
              g.updated_at = $now
ON MATCH SET g.title = $title,
             g.status = $status,
             g.severity = $severity,
             g.kind = $kind,
             g.updated_at = $now
WITH g

MATCH (d:DataType {name: $data_type})
MERGE (g)-[:INVOLVES]->(d)
WITH g

UNWIND (CASE WHEN $vendor_name IS NOT NULL THEN [$vendor_name] ELSE [] END) AS vname
MATCH (v:Vendor {name: vname})
MERGE (g)-[:AFFECTS]->(v)
WITH g

UNWIND $clause_ids AS clause_id
MATCH (c:DPDPClause {clause_id: clause_id})
MERGE (g)-[:VIOLATES]->(c)
"""


class Reconciler:
    def __init__(
        self,
        client: Optional[Neo4jClient] = None,
        system_name: str = DEFAULT_SYSTEM_NAME,
    ):
        self.client = client or Neo4jClient()
        self.system_name = system_name

    def close(self):
        self.client.close()

    def find_and_write_gaps(self) -> dict:
        """
        Returns {"gaps_written": N, "gaps_by_kind": {...}}.
        """
        retriever = DPDPRetriever(self.client)
        clauses_by_dt = retriever.clauses_for_system(self.system_name)

        now = datetime.now(timezone.utc).isoformat()

        written = 0
        skipped_malformed = []
        kind_counts = {
            "ungoverned_egress": 0,
            "future_obligation": 0,
            "ungoverned_collection": 0,
        }

        for data_type, clauses in clauses_by_dt.items():
            try:
                # Query VENDORS_FOR_DATA_TYPE
                vendor_rows = self.client.run_read(
                    VENDORS_FOR_DATA_TYPE, {"data_type": data_type}
                )
                vendors = vendor_rows[0]["vendors"] if vendor_rows else []

                # Classify
                severity, kind = classify_gap(vendors, clauses)

                if kind is None:
                    # otherwise -> no gap
                    continue

                target_vendors = vendors if vendors else [None]
                clause_ids = [c["clause_id"] for c in clauses]

                for vendor in target_vendors:
                    gap_id = f"gap-{data_type}-{vendor or 'none'}"

                    if vendor:
                        title = f"Ungoverned data sharing: {data_type} sent to {vendor}"
                    else:
                        title = f"Ungoverned data collection: {data_type}"

                    params = {
                        "id": gap_id,
                        "title": title,
                        "status": "open",
                        "severity": severity,
                        "kind": kind,
                        "ai_recommendation": "",
                        "now": now,
                        "data_type": data_type,
                        "vendor_name": vendor,
                        "clause_ids": clause_ids,
                    }

                    self.client.run_write(MERGE_GAP, params)
                    written += 1
                    kind_counts[kind] += 1

            except Exception as exc:
                skipped_malformed.append(
                    {"data_type": data_type, "error": str(exc)}
                )
                continue

        if skipped_malformed:
            logger.warning(
                "Skipped %d malformed gap evaluation(s): %s",
                len(skipped_malformed),
                [s["error"] for s in skipped_malformed],
            )

        logger.info("Wrote %d gaps to the graph", written)
        return {"gaps_written": written, "gaps_by_kind": kind_counts}
