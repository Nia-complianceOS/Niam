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

from app.schemas.common import ComplianceStatus
from app.schemas.graph import GraphEdge, GraphNode, GraphResponse

_MOCK_NODES = [
    GraphNode(id="db", label="Database", node_type="database", status=ComplianceStatus.COMPLIANT,
              data_collected="Profile, order history", purpose="Persistent storage", retention="Account lifetime"),
    GraphNode(id="aws", label="AWS", node_type="cloud", status=ComplianceStatus.COMPLIANT,
              data_collected="Encrypted backups", purpose="Infrastructure hosting", retention="30 day snapshots"),
    GraphNode(id="openai", label="OpenAI", node_type="vendor", status=ComplianceStatus.COMPLIANT,
              data_collected="Support chat transcripts", purpose="AI assistant", retention="30 days"),
    GraphNode(id="mixpanel", label="Mixpanel", node_type="vendor", status=ComplianceStatus.GAP,
              status_detail="Gap: disclosure missing", data_collected="IP, Device ID, Purchase Events",
              purpose="Product analytics", retention="12 months"),
    GraphNode(id="privacy", label="Privacy Policy", node_type="legal_document", status=ComplianceStatus.WARNING,
              status_detail="96% coverage", data_collected="Discloses all flows above", purpose="Legal disclosure"),
    GraphNode(id="cookie", label="Cookie Banner", node_type="legal_document", status=ComplianceStatus.GAP,
              status_detail="Missing analytics category", data_collected="Consent state", purpose="Consent capture",
              retention="12 months"),
    GraphNode(id="dpdp", label="DPDP", node_type="regulation", status=ComplianceStatus.WARNING,
              status_detail="93% mapped", purpose="Regulatory framework"),
    GraphNode(id="gdpr", label="GDPR", node_type="regulation", status=ComplianceStatus.WARNING,
              status_detail="82% mapped", purpose="Regulatory framework"),
]

_MOCK_EDGES = [
    GraphEdge(id="e1", source="db", target="aws", relationship="FLOWS_TO"),
    GraphEdge(id="e2", source="db", target="openai", relationship="FLOWS_TO"),
    GraphEdge(id="e3", source="db", target="mixpanel", relationship="FLOWS_TO"),
    GraphEdge(id="e4", source="mixpanel", target="privacy", relationship="DISCLOSED_IN"),
    GraphEdge(id="e5", source="mixpanel", target="cookie", relationship="DISCLOSED_IN"),
    GraphEdge(id="e6", source="privacy", target="dpdp", relationship="GOVERNED_BY"),
    GraphEdge(id="e7", source="privacy", target="gdpr", relationship="GOVERNED_BY"),
    GraphEdge(id="e8", source="cookie", target="gdpr", relationship="GOVERNED_BY"),
    GraphEdge(id="e9", source="aws", target="dpdp", relationship="GOVERNED_BY"),
]


def get_compliance_graph() -> GraphResponse:
    return GraphResponse(
        nodes=_MOCK_NODES,
        edges=_MOCK_EDGES,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )