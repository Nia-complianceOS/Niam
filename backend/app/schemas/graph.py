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
    generated_at: str
