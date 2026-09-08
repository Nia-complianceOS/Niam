"""
Serves the Living Compliance Graph to the frontend.

This is real Neo4j data -- the "mock data below" the old docstring
promised has not existed for some time.

Two things it did not do, both fixed here.

1. It gave no node a compliance status. The node query read
   `coalesce(n.status, 'unknown')`, and only :DPDPClause nodes carry a
   `status` property at all -- and theirs is the commencement vocabulary
   ("in_force" / "not_yet_commenced"), not the four values the graph
   legend is drawn in. So every System, DataType and Vendor rendered
   grey, every clause rendered with an undefined colour, and the legend
   described a colour scheme nothing on screen used.

2. It was unbounded. Every System, DataType, Vendor and DPDPClause node
   and every COLLECTS/SENT_TO/GOVERNED_BY edge came back on every
   request, straight into a D3 force simulation. Fine at 53 nodes;
   not fine once the full Act is loaded against a real repository.

Status is derived from the graph itself:

  DataType  governed by an in-force clause            -> compliant
            governed only by clauses not yet in force -> warning
            governed by nothing                       -> gap
  Vendor    over the data types sent to it: all covered -> compliant,
            some -> warning, none -> gap, no data types -> unknown
  System    same rule, over the data types it collects
  Clause    in_force -> compliant, not_yet_commenced -> warning

Every colour on the page traces to a node or an edge. The Vendor/System
rule is deliberately the same one gap_service.list_vendors() applies, so
the Vendors page and the Graph page cannot disagree about a vendor -- and
it is computed in Cypher over the whole of THIS ACCOUNT'S graph, not over
the truncated page, so a system does not read "compliant" merely because
the data types that would have contradicted it fell past the limit.

TENANCY (smoke/TENANCY_CONTRACT.md). This page was the worst offender:
`MATCH (n) WHERE n:System OR n:DataType OR n:Vendor OR n:DPDPClause`
drew every account's systems, data types and vendors onto one canvas,
with the edges between them, labelled with the vendor names and data
types of whoever else was on the instance. Every owned label now carries
an `owner_id = $owner_id` filter.

:DPDPClause is not owned and is not filtered by owner -- but it is not
returned unconditionally either. A clause is included only when one of
THIS account's data types is governed by it, which is what the page is
for: the Act as it touches this product. That choice also settles the
empty case honestly. A brand-new account has no :System, no :DataType
and no :Vendor, so nothing reaches a clause, so the response is
`nodes: [], edges: [], total_nodes: 0, truncated: false` -- an empty
canvas, which is what an account that has never run a scan has. The
alternative, dumping all ~44 unowned clause nodes into the graph of a
user with nothing, would render a dense cloud of law with no edge to
anything they own and read as "here is your compliance graph".
"""

from datetime import datetime, timezone

from app.db.database import run_query
from app.schemas.graph import GraphEdge, GraphNode, GraphResponse

# The one definition of "a clause that obliges a Data Fiduciary", shared
# with the reconciler. Without this filter ss.36 and 37 -- the Central
# Government's powers to call for information and issue directions, the
# only sections in force today -- counted as coverage and painted the
# whole graph green while the reconciler was calling every data type a
# future obligation.
from legal.commencement import FIDUCIARY_OBLIGATION_SECTIONS

# The DataType node the extractor tags for clauses that apply to all
# personal data. Mirrors DPDPRetriever.GENERAL_DATA_TYPE; imported by
# value rather than by import to keep this module free of the Neo4j
# client that module constructs. Unify at G2.
GENERAL_DATA_TYPE = "other_personal_data"

# Nodes past this are not returned. The D3 canvas degrades well before a
# thousand nodes, and the page now pans and zooms, so the honest move is
# to return a bounded slice and say it is one.
DEFAULT_NODE_LIMIT = 300
MAX_NODE_LIMIT = 1000

# OPTIONAL MATCH + count() rather than COUNT {} subqueries here. The
# summary query in retrieval/queries.py can use COUNT {} because its
# subqueries are self-contained; this one would have to reference the
# outer `n`, which is a newer and less portable form. count() skips
# nulls, so the CASE with no ELSE counts exactly the in-force clauses,
# and a node with no GOVERNED_BY edge at all still returns one row with
# both counts at zero -- which is precisely the "collected but
# ungoverned" signal we colour red.
#
# The ORDER BY decides what survives truncation: the System -> DataType
# -> Vendor flow map is the point of this page, so clauses are dropped
# first. Ordering is also what makes the slice stable between requests.
#
# The owner predicate. :System/:DataType/:Vendor are this account's own.
# A :DPDPClause is shared reference data and carries no owner_id at all,
# so it earns its place on the canvas by being reachable from one of this
# account's data types.
#
# EXISTS {} rather than COUNT {} deliberately, and not for style. The
# note below this one explains why the aggregation in _QUERY_NODES avoids
# COUNT {}: it would have to reference the outer `n`, which is the newer
# and less portable form. This predicate has the same requirement, and
# EXISTS { MATCH ... } is the one subquery form that has taken an outer
# variable since 4.3 -- so it runs on whatever 5.x the local container
# pulled as well as on Aura. It is also the cheaper question: "is there
# at least one" stops at the first match.
_OWNED_OR_REACHED = """
  ((n:System OR n:DataType OR n:Vendor) AND n.owner_id = $owner_id)
  OR (n:DPDPClause AND EXISTS {
        MATCH (:DataType {owner_id: $owner_id})-[:GOVERNED_BY]->(n)
      })
"""

_QUERY_NODES = """
MATCH (n) WHERE """ + _OWNED_OR_REACHED + """
OPTIONAL MATCH (n)-[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.section IN $obligation_sections
WITH n, labels(n)[0] AS node_type,
     count(CASE WHEN c.status = 'in_force' THEN 1 END) AS clauses_in_force,
     count(c) AS clauses_total
RETURN elementId(n) AS id, node_type,
       coalesce(n.name, n.title, n.clause_id) AS label,
       n.status AS raw_status, clauses_in_force, clauses_total
ORDER BY CASE node_type
           WHEN 'System' THEN 0
           WHEN 'DataType' THEN 1
           WHEN 'Vendor' THEN 2
           ELSE 3
         END, label
LIMIT $limit
"""

# Clauses that apply to ALL personal data, and therefore to every data
# type in the graph even though only the other_personal_data node carries
# the edge. Most of the DPDP Act is written this way, so leaving these out
# made almost every data type render as ungoverned -- a harsher reading
# than the Act supports, and one that contradicted the gap engine.
_QUERY_GENERAL_COVERAGE = """
MATCH (:DataType {owner_id: $owner_id, name: $general_data_type})
      -[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.section IN $obligation_sections
RETURN count(c) AS total,
       count(CASE WHEN c.status = 'in_force' THEN 1 END) AS in_force
"""

# Same predicate as _QUERY_NODES, so `truncated` compares like with
# like. Counting every node in the instance here would have told a user
# with 4 nodes that their graph was truncated from 900.
_QUERY_NODE_COUNT = """
MATCH (n) WHERE """ + _OWNED_OR_REACHED + """
RETURN count(n) AS total
"""

# Scoped to the nodes actually returned. An edge pointing at a node that
# was truncated away is not merely untidy -- d3.forceLink throws on a
# link whose source or target id is not in the node array, which would
# take the whole canvas down rather than degrade it.
#
# $ids is what scopes this to one account: it comes from _QUERY_NODES,
# which is owner-filtered, so an edge can only be returned when BOTH its
# endpoints are nodes this account was already shown. There is no label
# in this pattern to hang an owner_id on -- `(a)-[r]->(b)` is deliberately
# label-free so one query covers all three relationship types -- so if
# _QUERY_NODES ever loses its filter, this loses its scoping with it.
# That is the coupling to watch when editing either one.
_QUERY_EDGES = """
MATCH (a)-[r]->(b)
WHERE type(r) IN ['COLLECTS','SENT_TO','GOVERNED_BY']
  AND elementId(a) IN $ids AND elementId(b) IN $ids
RETURN elementId(r) AS id, elementId(a) AS source, elementId(b) AS target,
       type(r) AS relationship
"""

# Coverage per Vendor and per System, over the entire graph rather than
# the returned page. count() skips nulls, so `covered` counts exactly the
# data types with at least one in-force clause.
#
# `owner` below is the graph node the coverage belongs to (a :System or a
# :Vendor), not the account -- the account is $owner_id, filtered on
# every owned label in both halves of the UNION.
_QUERY_COVERAGE = """
MATCH (s:System {owner_id: $owner_id})
      -[:COLLECTS]->(d:DataType {owner_id: $owner_id})
OPTIONAL MATCH (d)-[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.status = 'in_force' AND c.section IN $obligation_sections
WITH s AS owner, d, count(c) AS in_force
RETURN elementId(owner) AS id, count(d) AS total,
       count(CASE WHEN in_force > 0 THEN 1 END) AS covered,
       collect(d.name)[..12] AS data_types
UNION
MATCH (d:DataType {owner_id: $owner_id})
      -[:SENT_TO]->(v:Vendor {owner_id: $owner_id})
OPTIONAL MATCH (d)-[:GOVERNED_BY]->(c:DPDPClause)
WHERE c.status = 'in_force' AND c.section IN $obligation_sections
WITH v AS owner, d, count(c) AS in_force
RETURN elementId(owner) AS id, count(d) AS total,
       count(CASE WHEN in_force > 0 THEN 1 END) AS covered,
       collect(d.name)[..12] AS data_types
"""


def _data_type_status(record: dict, general: dict) -> tuple[str, str]:
    """Status for one DataType, counting BOTH the clauses that name it and
    the general obligations that apply to all personal data.

    `record` holds only the clauses edged directly to this node -- the ones
    the extractor tagged with this data type by name. Judging on those
    alone marked almost every data type ungoverned, because the DPDP Act
    writes most of its duties about personal data as such. The wording
    below keeps the two apart, so "s.9 names this data" never gets stated
    as though it were "the general obligations cover it".
    """
    specific_total = record["clauses_total"]
    specific_in_force = record["clauses_in_force"]
    total = specific_total + general["total"]
    in_force = specific_in_force + general["in_force"]

    def _basis() -> str:
        if specific_total and general["total"]:
            return f"{specific_total} naming it, {general['total']} general"
        if specific_total:
            return f"{specific_total} naming it"
        return f"{general['total']} general"

    if in_force:
        return "compliant", f"{in_force} in-force obligation(s) — {_basis()}"
    if total:
        return "warning", (
            f"{total} obligation(s) apply, none in force yet — {_basis()}"
        )
    return "gap", "Collected, but no DPDP obligation governs it"


def _clause_status(raw: str | None) -> tuple[str, str]:
    if raw == "in_force":
        return "compliant", "In force"
    if raw == "not_yet_commenced":
        return "warning", "Not yet commenced"
    return "unknown", "Commencement unknown"


def _coverage_status(total: int, covered: int) -> tuple[str, str]:
    """Vendor/System status from its data types.

    Same three-way split gap_service.list_vendors() uses, so a vendor
    cannot read "Covered" on one page and gap-red on another.
    """
    if not total:
        return "unknown", "No data types attached"
    if covered == total:
        return "compliant", f"All {total} data type(s) covered"
    if covered:
        return "warning", f"{covered} of {total} data type(s) covered"
    return "gap", f"None of {total} data type(s) covered"


def get_compliance_graph(
    owner_id: str, limit: int = DEFAULT_NODE_LIMIT
) -> GraphResponse:
    """One account's compliance graph.

    `owner_id` is required and comes from Depends(require_auth).

    An account with an empty subgraph gets an empty response, not an
    error: no nodes, no edges, total_nodes 0, truncated False. Every
    query below aggregates or returns rows, and none of them needs a
    match to succeed -- so nothing here has to special-case "new user",
    and nothing invents a node to fill the canvas.
    """
    limit = max(1, min(limit, MAX_NODE_LIMIT))
    sections = sorted(FIDUCIARY_OBLIGATION_SECTIONS)
    owner = {"owner_id": owner_id}

    node_records = run_query(
        _QUERY_NODES,
        {**owner, "limit": limit, "obligation_sections": sections},
    )
    node_ids = [record["id"] for record in node_records]

    count_rows = run_query(_QUERY_NODE_COUNT, owner)
    total_nodes = count_rows[0]["total"] if count_rows else len(node_records)

    general_rows = run_query(
        _QUERY_GENERAL_COVERAGE,
        {
            **owner,
            "general_data_type": GENERAL_DATA_TYPE,
            "obligation_sections": sections,
        },
    )
    general = (
        general_rows[0] if general_rows else {"total": 0, "in_force": 0}
    )

    # No node ids means no edges, and no reason to ask. Neo4j would
    # happily run both against an empty list; skipping is one less round
    # trip on the request a brand-new account makes most often.
    edge_records = (
        run_query(_QUERY_EDGES, {"ids": node_ids}) if node_ids else []
    )
    coverage = {
        row["id"]: row
        for row in run_query(
            _QUERY_COVERAGE, {**owner, "obligation_sections": sections}
        )
    }

    edges = [
        GraphEdge(
            id=record["id"],
            source=record["source"],
            target=record["target"],
            relationship=record["relationship"],
        )
        for record in edge_records
    ]

    nodes = []
    for record in node_records:
        node_type = record["node_type"]
        label = record["label"] or "Unknown"

        if node_type == "DataType":
            status, detail = _data_type_status(record, general)
            collected = label
        elif node_type == "DPDPClause":
            status, detail = _clause_status(record["raw_status"])
            collected = ""
        else:
            row = coverage.get(record["id"])
            total = row["total"] if row else 0
            covered = row["covered"] if row else 0
            # A general in-force obligation covers every data type, so it
            # covers all of this owner's. _QUERY_COVERAGE only sees the
            # clauses edged to each data type by name.
            if general["in_force"] and total:
                covered = total
            status, detail = _coverage_status(total, covered)
            names = sorted(row["data_types"]) if row else []
            collected = ", ".join(names)
            if row and row["total"] > len(names):
                collected += f", +{row['total'] - len(names)} more"

        nodes.append(
            GraphNode(
                id=record["id"],
                label=label,
                node_type=node_type,
                status=status,
                status_detail=detail,
                data_collected=collected,
            )
        )

    return GraphResponse(
        nodes=nodes,
        edges=edges,
        total_nodes=total_nodes,
        node_limit=limit,
        truncated=total_nodes > len(nodes),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
