"""
The backend half of smoke/TENANCY_CONTRACT.md, enforced.

Two failures this guards against, both silent.

1. A QUERY THAT FORGETS THE FILTER. `MATCH (g:Gap)` does not raise; it
   returns every account's compliance findings -- vendor names, source
   file paths, commit SHAs from private repositories -- to whoever asked.
   test_every_owned_query_filters_by_owner reads the Cypher constants the
   services actually run and requires $owner_id in each, with a short,
   named list of deliberate exceptions.

2. A SERVICE THAT DROPS THE OWNER. Every public read/write here takes
   owner_id as its FIRST parameter, so a call site that forgets it fails
   loudly on arity instead of quietly defaulting to somebody's data.

Neither needs a database. Both are cheap enough to keep honest.
"""

import ast
import inspect
import pathlib
import re

import pytest

from app.services import (
    audit_service,
    dashboard_service,
    gap_service,
    github_identity,
    github_service,
    graph_service,
    scan_service,
    scan_store,
    user_service,
    workspace_service,
)

# Labels that carry owner_id, per the contract. :DPDPClause is absent
# because the Act is one shared corpus, and :RemediationDraft because it
# is only ever reached through the :Gap that owns it.
OWNED_LABELS = (
    "System",
    "DataType",
    "Vendor",
    "PolicyDocument",
    "Gap",
    "Scan",
    "PullRequest",
)

# Queries that touch an owned label and deliberately carry no owner
# filter. Each one needs a reason that survives being read aloud.
UNSCOPED_BY_DESIGN = {
    # Counts running scans across every account to enforce the global
    # concurrency cap on a shared classifier quota. Returns one integer
    # and no property of anyone's scan.
    ("scan_store", "_GLOBAL_RUNNING"),
    # Label-free `(a)-[r]->(b)`, bounded to elementIds that came from the
    # owner-filtered node query. There is no label in the pattern to hang
    # a filter on; its scoping is inherited from _QUERY_NODES.
    ("graph_service", "_QUERY_EDGES"),
}

MODULES = {
    "audit_service": audit_service,
    "dashboard_service": dashboard_service,
    "gap_service": gap_service,
    "github_identity": github_identity,
    "github_service": github_service,
    "graph_service": graph_service,
    "scan_service": scan_service,
    "scan_store": scan_store,
    "user_service": user_service,
    "workspace_service": workspace_service,
}

# `MATCH (x:Label` / `MATCH (:Label` / `-[:REL]->(v:Label` -- anywhere an
# owned label enters a pattern.
_OWNED_IN_PATTERN = re.compile(
    r"\(\s*\w*\s*:(" + "|".join(OWNED_LABELS) + r")\b"
)


def _cypher_constants(module):
    """Module-level strings that look like Cypher, by name and value."""
    for name, value in vars(module).items():
        if isinstance(value, str) and "MATCH" in value and name.isupper():
            yield name, value


def _all_query_constants():
    for mod_name, module in MODULES.items():
        for name, query in _cypher_constants(module):
            yield mod_name, name, query


# --- inline Cypher, not just module constants -------------------------
#
# gap_service writes two of its queries inline inside the function that
# runs them (the status updates in generate_fix and mark_pr_opened).
# Those are exactly as capable of leaking as a named constant, so they
# are found by walking each service file's AST for string literals that
# look like Cypher. Docstrings are skipped -- several of them quote
# `MATCH (g:Gap)` as the example of what NOT to write, and a guard that
# fails on its own documentation teaches people to delete the guard.

SERVICE_FILES = [
    "app/services/audit_service.py",
    "app/services/dashboard_service.py",
    "app/services/gap_service.py",
    "app/services/github_identity.py",
    "app/services/github_service.py",
    "app/services/graph_service.py",
    "app/services/scan_store.py",
    "app/services/scan_service.py",
    "app/services/user_service.py",
    "app/services/workspace_service.py",
]


def _docstring_nodes(tree):
    """Every string literal that is a docstring or a bare string statement."""
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            if isinstance(node.value.value, str):
                out.add(id(node.value))
    return out


def _inline_queries():
    root = pathlib.Path(__file__).resolve().parent.parent
    for rel in SERVICE_FILES:
        source = (root / rel).read_text(encoding="utf-8")
        tree = ast.parse(source)
        skip = _docstring_nodes(tree)
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant):
                continue
            if not isinstance(node.value, str) or id(node) in skip:
                continue
            if "MATCH" in node.value:
                yield rel, node.lineno, node.value


def test_inline_cypher_filters_by_owner():
    """Same rule as the constants, applied to queries written in place."""
    offenders = []
    for rel, lineno, query in _inline_queries():
        if not _OWNED_IN_PATTERN.search(query):
            continue
        if "$owner_id" in query:
            continue
        # The two constants excused above are matched here by value, not
        # by name, since the AST walk does not know what they were called.
        if any(
            query == getattr(MODULES[mod], name, None)
            for mod, name in UNSCOPED_BY_DESIGN
        ):
            continue
        offenders.append(f"{rel}:{lineno}")
    assert not offenders, (
        "inline Cypher puts an owned label into a pattern without "
        f"filtering on $owner_id at: {', '.join(offenders)}"
    )

def test_supabase_queries_filter_by_owner():
    """Every Supabase query in a service must filter by user_id or owner_id."""
    offenders = []
    root = pathlib.Path(__file__).resolve().parent.parent
    for rel in SERVICE_FILES:
        source = (root / rel).read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if node.name in ("global_running", "create_user", "consume_state", "create_state", "get_user_by_email", "get_user_by_id"):
                    continue  # Unscoped by design, handles its own pk, or gets state/user
                for child in ast.walk(node):
                    if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute) and child.func.attr == "execute":
                        is_supabase = False
                        has_user_id = False
                        curr = child
                        while isinstance(curr, ast.Call):
                            if isinstance(curr.func, ast.Attribute):
                                if curr.func.attr == "table":
                                    is_supabase = True
                                elif curr.func.attr == "eq" and curr.args:
                                    if isinstance(curr.args[0], ast.Constant) and curr.args[0].value in ("user_id", "owner_id", "id"):
                                        has_user_id = True
                                elif curr.func.attr in ("insert", "update", "upsert") and curr.args:
                                    if isinstance(curr.args[0], ast.Dict):
                                        for key in curr.args[0].keys:
                                            if isinstance(key, ast.Constant) and key.value in ("user_id", "owner_id", "id"):
                                                has_user_id = True
                                curr = curr.func.value
                            else:
                                break
                        if is_supabase and not has_user_id:
                            offenders.append(f"{rel}:{child.lineno}")
    assert not offenders, f"Supabase queries missing user_id filter: {', '.join(offenders)}"


def test_there_are_queries_to_check():
    """Guards the guard. If the constants are ever renamed out of the
    _cypher_constants() heuristic, every assertion below would pass
    vacuously -- which is the worst possible outcome for this test."""
    found = list(_all_query_constants())
    assert len(found) >= 10, f"only found {len(found)} queries to check"


@pytest.mark.parametrize(
    "mod_name,name,query",
    [pytest.param(*t, id=f"{t[0]}.{t[1]}") for t in _all_query_constants()],
)
def test_every_owned_query_filters_by_owner(mod_name, name, query):
    if not _OWNED_IN_PATTERN.search(query):
        return  # touches no owned label
    if (mod_name, name) in UNSCOPED_BY_DESIGN:
        return
    assert "$owner_id" in query, (
        f"{mod_name}.{name} puts an owned label into a pattern without "
        "filtering on $owner_id. A missing filter does not raise -- it "
        "serves another account's compliance findings. See "
        "smoke/TENANCY_CONTRACT.md."
    )


# Every public entry point, and the position owner_id must occupy.
PUBLIC_FUNCTIONS = [
    (dashboard_service, "get_dashboard_summary"),
    (graph_service, "get_compliance_graph"),
    (gap_service, "list_gaps"),
    (gap_service, "get_gap"),
    (gap_service, "generate_fix"),
    (gap_service, "mark_pr_opened"),
    (gap_service, "list_vendors"),
    (gap_service, "list_regulations"),
    (gap_service, "list_policies"),
    (gap_service, "list_audit_events"),
    (scan_service, "run_scan"),
    (scan_store, "create"),
    (scan_store, "set_status"),
    (scan_store, "append_log"),
    (scan_store, "get"),
    (scan_store, "user_activity"),
    (audit_service, "log_event"),
    (audit_service, "list_events"),
    (github_identity, "save_connection"),
    (github_identity, "delete_connection"),
    (github_identity, "get_connection"),
    (github_service, "open_compliance_pr"),
    (workspace_service, "list_scanned_repositories"),
    (workspace_service, "delete_repository"),
    (workspace_service, "reset_account_data"),
]


@pytest.mark.parametrize(
    "module,func_name",
    PUBLIC_FUNCTIONS,
    ids=[f"{m.__name__.rsplit('.', 1)[-1]}.{n}" for m, n in PUBLIC_FUNCTIONS],
)
def test_owner_id_is_the_first_parameter(module, func_name):
    params = list(inspect.signature(getattr(module, func_name)).parameters)
    assert params, f"{func_name} takes no arguments"
    assert params[0] in ("owner_id", "user_id"), (
        f"{func_name}'s first parameter is '{params[0]}', not 'owner_id' or 'user_id'. "
        "Keeping it first is what makes a forgotten owner a TypeError at "
        "the call site rather than a cross-account read at runtime."
    )
    # And it must not have a default -- a default owner is a guess.
    default = inspect.signature(
        getattr(module, func_name)
    ).parameters[params[0]].default
    assert default is inspect.Parameter.empty, (
        f"{func_name} defaults owner_id to {default!r}; there is no "
        "sensible account to guess."
    )
