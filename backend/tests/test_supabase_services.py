"""
Tests for Supabase interactions in the services.
"""
import pytest
from app.services import user_service, github_identity, scan_store

# Mock classes for Supabase
class MockData:
    def __init__(self, data=None):
        self.data = data or [{"id": "mock_id", "email": "test@test.com", "hashed_password": "hash", "name": "Test"}]
        self.count = len(self.data)

class MockBuilder:
    def __init__(self):
        self._calls = []
    
    def select(self, *args, **kwargs):
        self._calls.append(("select", args, kwargs))
        return self
        
    def eq(self, *args, **kwargs):
        self._calls.append(("eq", args, kwargs))
        return self
        
    def in_(self, *args, **kwargs):
        self._calls.append(("in_", args, kwargs))
        return self

    def insert(self, *args, **kwargs):
        self._calls.append(("insert", args, kwargs))
        return self

    def update(self, *args, **kwargs):
        self._calls.append(("update", args, kwargs))
        return self

    def upsert(self, *args, **kwargs):
        self._calls.append(("upsert", args, kwargs))
        return self

    def delete(self, *args, **kwargs):
        self._calls.append(("delete", args, kwargs))
        return self
        
    def gte(self, *args, **kwargs):
        self._calls.append(("gte", args, kwargs))
        return self
        
    def maybe_single(self):
        self._calls.append(("maybe_single", (), {}))
        self._is_single = True
        return self

    def execute(self):
        self._calls.append(("execute", (), {}))
        dummy = {"id": "dummy", "email": "test@test.com", "hashed_password": "hash", "name": "Test", "log": []}
        return MockData(dummy if getattr(self, '_is_single', False) else [dummy])

class MockTable:
    def __init__(self, name):
        self.name = name
        self.builder = MockBuilder()

    def select(self, *args, **kwargs): return self.builder.select(*args, **kwargs)
    def insert(self, *args, **kwargs): return self.builder.insert(*args, **kwargs)
    def update(self, *args, **kwargs): return self.builder.update(*args, **kwargs)
    def upsert(self, *args, **kwargs): return self.builder.upsert(*args, **kwargs)
    def delete(self, *args, **kwargs): return self.builder.delete(*args, **kwargs)

class MockClient:
    def __init__(self):
        self.tables = {}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = MockTable(name)
        return self.tables[name]

@pytest.fixture
def mock_supabase(monkeypatch):
    client = MockClient()
    def _get_supabase():
        return client
        
    for mod in (user_service, github_identity, scan_store):
        if hasattr(mod, "get_supabase"):
            monkeypatch.setattr(mod, "get_supabase", _get_supabase)
    return client

def test_create_user(mock_supabase):
    user = user_service.create_user("new_user@example.com", "hash123")
    assert user is not None
    table = mock_supabase.tables.get("users")
    assert table is not None
    insert_call = next(c for c in table.builder._calls if c[0] == "insert")
    assert insert_call[1][0]["email"] == "new_user@example.com"
    # verify user_id/owner_id is always in the query filter (except for create_user which creates the row)

def test_github_identity_save_connection(mock_supabase):
    github_identity.save_connection("owner1", "token123", "github_user", "http://av", ["repo"], "oauth")
    table = mock_supabase.tables.get("github_connections")
    assert table is not None
    upsert_call = next(c for c in table.builder._calls if c[0] == "upsert")
    # Verify owner_id (user_id) is always in the query filter/upsert payload
    assert upsert_call[1][0]["user_id"] == "owner1"

def test_scan_store_create(mock_supabase):
    scan_store.create("owner2", "scan2", "org/repo", "main", "org__repo")
    table = mock_supabase.tables.get("scans")
    assert table is not None
    insert_call = next(c for c in table.builder._calls if c[0] == "insert")
    assert insert_call[1][0]["user_id"] == "owner2"

def test_scan_store_get(mock_supabase):
    scan_store.get("owner3", "scan3")
    table = mock_supabase.tables.get("scans")
    assert table is not None
    eq_calls = [c for c in table.builder._calls if c[0] == "eq"]
    # Verify owner_id (user_id) is always in the query filter
    assert any(c[1] == ("user_id", "owner3") for c in eq_calls)
