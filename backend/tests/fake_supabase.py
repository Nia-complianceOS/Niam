"""A small in-memory stand-in for the supabase-py query builder.

Enough of the API for the services under test: select / insert / update /
upsert / delete with eq, in_, is_, lt, gte, order, limit, maybe_single.
rpc() raises, which exercises every service's non-RPC fallback path.
Embedded selects ("workspaces(name)") are ignored and return no join.
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table = table
        self.op = "select"
        self.payload = None
        self.filters = []
        self.single = False
        self._limit = None
        self._order = None
        self.on_conflict = None

    # operations
    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload, on_conflict=None):
        self.op, self.payload, self.on_conflict = "upsert", payload, on_conflict
        return self

    def delete(self):
        self.op = "delete"
        return self

    # filters
    def eq(self, col, val):
        self.filters.append(lambda r, c=col, v=val: str(r.get(c)) == str(v))
        return self

    def in_(self, col, vals):
        vals = [str(v) for v in vals]
        self.filters.append(lambda r, c=col: str(r.get(c)) in vals)
        return self

    def is_(self, col, val):
        assert val == "null"
        self.filters.append(lambda r, c=col: r.get(c) is None)
        return self

    def lt(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) is not None and str(r.get(c)) < str(v))
        return self

    def gte(self, col, val):
        self.filters.append(lambda r, c=col, v=val: r.get(c) is not None and str(r.get(c)) >= str(v))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def maybe_single(self):
        self.single = True
        return self

    # execution
    def _match(self):
        rows = self.db.tables.setdefault(self.table, [])
        return [r for r in rows if all(f(r) for f in self.filters)]

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "select":
            out = [copy.deepcopy(r) for r in self._match()]
            if self._order:
                col, desc = self._order
                out.sort(key=lambda r: str(r.get(col) or ""), reverse=desc)
            if self._limit:
                out = out[: self._limit]
            if self.single:
                return None if not out else _Resp(out[0])
            return _Resp(out, count=len(out))
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for item in items:
                row = self.db._defaults(self.table, dict(item))
                self.db._check_unique(self.table, row)
                rows.append(row)
                out.append(copy.deepcopy(row))
            return _Resp(out)
        if self.op == "upsert":
            keys = (self.on_conflict or "id").split(",")
            item = dict(self.payload)
            for r in rows:
                if all(str(r.get(k)) == str(item.get(k)) for k in keys):
                    r.update(item)
                    return _Resp([copy.deepcopy(r)])
            row = self.db._defaults(self.table, item)
            rows.append(row)
            return _Resp([copy.deepcopy(row)])
        if self.op == "update":
            out = []
            for r in self._match():
                r.update(self.payload)
                out.append(copy.deepcopy(r))
            return _Resp(out)
        if self.op == "delete":
            matched = self._match()
            self.db.tables[self.table] = [r for r in rows if r not in matched]
            return _Resp([copy.deepcopy(r) for r in matched])
        raise AssertionError(self.op)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.unique: dict[str, list[tuple[str, ...]]] = {
            "users": [("email",)],
            "workspace_members": [("workspace_id", "user_id")],
        }

    def table(self, name):
        return _Query(self, name)

    def rpc(self, *_a, **_k):
        raise RuntimeError("rpc not available in the fake")

    def _defaults(self, table, row):
        row.setdefault("id", str(uuid.uuid4()))
        now = datetime.now(timezone.utc).isoformat()
        row.setdefault("created_at", now)
        if table in ("remediation_reviews", "scans"):
            row.setdefault("updated_at", now)
        if table == "remediation_reviews":
            row.setdefault("approvals", {})
        return row

    def _check_unique(self, table, row):
        for cols in self.unique.get(table, []):
            for r in self.tables.get(table, []):
                if all(str(r.get(c)) == str(row.get(c)) for c in cols):
                    raise RuntimeError(f"duplicate key value violates unique constraint 23505 on {table}")
