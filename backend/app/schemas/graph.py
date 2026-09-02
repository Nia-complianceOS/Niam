from typing import List

from pydantic import BaseModel


class GraphNode(BaseModel):
    id: str
    label: str
    node_type: str
    status: str
    status_detail: str = ""
    data_collected: str = ""
    purpose: str = ""
    retention: str = ""


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relationship: str


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    # How many nodes exist versus how many were returned. The query used
    # to be unbounded; it is now capped, and a capped view has to say so
    # rather than quietly look like the whole graph.
    total_nodes: int = 0
    node_limit: int = 0
    truncated: bool = False
    generated_at: str
