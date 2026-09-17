-- 002 — make the Postgres boundary real instead of decorative.
--
-- 001 enables row-level security and adds policies keyed on auth.uid().
-- That is the right shape for an app built on Supabase Auth. This app is
-- not: it issues its own JWTs (backend/app/core/auth.py) and stores
-- hashed_password in the users table itself. Nothing ever calls
-- supabase.auth, so auth.uid() is always NULL, every one of those
-- policies evaluates to NULL, and none of them ever grants anything.
--
-- Meanwhile the backend connects with SUPABASE_SECRET_KEY -- the service
-- role -- which bypasses row-level security entirely. So the policies in
-- 001 govern exactly nothing: not the backend, which bypasses them, and
-- not the anon key, which they deny.
--
-- Denying by accident is not the same as denying on purpose. A policy
-- that looks like protection invites someone to widen it later "so the
-- frontend can read its own row", and the users table holds password
-- hashes. This migration replaces the appearance with the fact.
--
-- The real per-account boundary is, and remains, the backend's own
-- user_id filtering on every query. That is enforced by a test rather
-- than by convention: backend/tests/test_tenancy_scoping.py walks the
-- AST of every service and fails on a Supabase query that does not
-- filter by user, with an explicit allowlist for the few that cannot.
--
-- Safe to re-run. Safe to run on a database that never had 001's
-- policies.

-- 1. Drop the policies that cannot fire.
DROP POLICY IF EXISTS "Users can view own data"   ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can view own data"   ON github_connections;
DROP POLICY IF EXISTS "Users can update own data" ON github_connections;
DROP POLICY IF EXISTS "Users can view own data"   ON oauth_states;
DROP POLICY IF EXISTS "Users can update own data" ON oauth_states;
DROP POLICY IF EXISTS "Users can view own data"   ON scans;
DROP POLICY IF EXISTS "Users can update own data" ON scans;
DROP POLICY IF EXISTS "Users can view own data"   ON audit_logs;
DROP POLICY IF EXISTS "Users can update own data" ON audit_logs;

-- 2. Keep RLS ON, with no policies at all.
--
-- RLS enabled + zero policies = deny everything, for every role except
-- the ones that bypass it. That is the intended state: it is the same
-- outcome 001 reached by accident, reached deliberately, and it means a
-- future policy has to be written on purpose rather than inherited.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;

-- 3. Revoke the table privileges the anon and authenticated roles get by
--    default in a Supabase project.
--
-- Belt and braces on top of step 2, and the more important half: RLS is
-- one ALTER TABLE away from being switched off by someone debugging,
-- whereas a revoked GRANT has to be re-granted explicitly. The anon key
-- is public by definition -- it ships in any frontend that uses it -- so
-- these tables should be unreachable with it even if RLS lapses.
REVOKE ALL ON users              FROM anon, authenticated;
REVOKE ALL ON github_connections FROM anon, authenticated;
REVOKE ALL ON oauth_states       FROM anon, authenticated;
REVOKE ALL ON scans              FROM anon, authenticated;
REVOKE ALL ON audit_logs         FROM anon, authenticated;

-- 4. And for anything added later: no default privileges for those roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;

-- What is deliberately NOT here: policies that would let the browser read
-- its own row. That would need Supabase Auth, and adopting it would mean
-- two identity systems in one app -- our JWTs and theirs -- with two
-- places a session can be valid in and two places it can be revoked.
-- One identity system is worth more than direct table reads the frontend
-- does not need, because it talks to our own API instead.
