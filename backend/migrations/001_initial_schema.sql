-- This migration file is meant to be run in the Supabase SQL Editor
-- or via the Supabase CLI (`supabase db push`).

-- 1. users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. github_connections
CREATE TABLE github_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    token_encrypted TEXT NOT NULL,
    login TEXT,
    avatar_url TEXT,
    scopes TEXT[] DEFAULT '{}',
    method TEXT NOT NULL DEFAULT 'token',  -- 'oauth' or 'token'
    connected_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. oauth_states
CREATE TABLE oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 4. scans
CREATE TABLE scans (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT 'main',
    system_name TEXT,
    trigger TEXT DEFAULT 'api',
    status TEXT DEFAULT 'queued',
    error TEXT,
    log JSONB DEFAULT '[]',
    started_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. audit_logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    actor TEXT,
    metadata JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Add indexes
CREATE INDEX idx_scans_user_id ON scans(user_id);
CREATE INDEX idx_scans_status ON scans(status);
CREATE INDEX idx_scans_started ON scans(started_at);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_occurred ON audit_logs(occurred_at DESC);
CREATE INDEX idx_oauth_state ON oauth_states(state);
CREATE INDEX idx_oauth_expires ON oauth_states(expires_at);

-- 7. Add Row Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: The Service Role key used by the backend automatically bypasses RLS.
-- The policies below ensure that if accessed via Supabase client, users can only read/update their own row.
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users can view own data" ON github_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own data" ON github_connections FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view own data" ON oauth_states FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own data" ON oauth_states FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view own data" ON scans FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own data" ON scans FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can view own data" ON audit_logs FOR SELECT USING (user_id = auth.uid());
