"""
Serves the Living Compliance Graph to Frontend.

Real version (once the Data & Graph Intelligence module has written
nodes/edges into Neo4j) queries via run_query() from app/db/database.py,
e.g.:

    nodes = run_query("MATCH (n) RETURN n LIMIT 200")
    edges = run_query("MATCH (a)-[r]->(b) RETURN a, type(r) AS rel, b LIMIT 200")

then maps each Neo4j record into GraphNode/GraphEdge. Mock data below
matches that eventual shape exactly so nothing downstream (Frontend's
D3 layout) needs to change when the swap happens.
"""

from datetime import datetime, timezone

from app.db.database import run_query
from app.schemas.graph import GraphEdge, GraphNode, GraphResponse

_QUERY_NODES = """
MATCH (n) WHERE n:System OR n:DataType OR n:Vendor OR n:DPDPClause
RETURN elementId(n) AS id, labels(n)[0] AS node_type,
       coalesce(n.name, n.title, n.clause_id) AS label,
       coalesce(n.status, 'unknown') AS status
"""

_QUERY_EDGES = """
MATCH (a)-[r]->(b) WHERE type(r) IN ['COLLECTS','SENT_TO','GOVERNED_BY']
RETURN elementId(r) AS id, elementId(a) AS source, elementId(b) AS target, type(r) AS relationship
"""


def get_compliance_graph() -> GraphResponse:
    node_records = run_query(_QUERY_NODES)
    edge_records = run_query(_QUERY_EDGES)

    nodes = [
        GraphNode(
            id=record["id"],
            label=record["label"] or "Unknown",
            node_type=record["node_type"],
            status=record["status"],
        )
        for record in node_records
    ]

    edges = [
        GraphEdge(
            id=record["id"],
            source=record["source"],
            target=record["target"],
            relationship=record["relationship"],
        )
        for record in edge_records
    ]

    return GraphResponse(
        nodes=nodes,
        edges=edges,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
