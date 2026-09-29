-- 004 — workspaces, members and invite links.
--
-- Two-stage approval needs two people on one set of findings: a legal
-- reviewer and an owner. Until now the tenant key was the individual user.
--
-- THE DESIGN MOVE THAT MAKES THIS CHEAP: every account gets a workspace
-- whose id IS its user id. Every owner_id already in Neo4j, and every
-- scans.user_id / audit_logs.user_id / github_connections.user_id already
-- in Postgres, therefore stays valid unchanged -- there is no graph
-- migration. Those columns now mean "workspace", and the request layer
-- resolves person -> workspace (backend/app/api/deps.py).
--
-- Invariant the code relies on: workspaces.id = the creating user's id,
-- and each user creates exactly one. That is what keeps the existing
-- user_id foreign keys valid when they hold a workspace id.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    -- {"require_distinct_approvers": false}. When true, the person who
    -- gives owner approval must differ from the legal approver.
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'legal', 'member')),
    invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON public.workspace_members(user_id);

-- Invite links. The token is shown once and stored only as a SHA-256
-- hash, so a database read does not hand out working invites.
CREATE TABLE IF NOT EXISTS public.workspace_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('legal', 'member', 'owner')),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_workspace ON public.workspace_invites(workspace_id);

-- Who did it, now that "which workspace" and "which person" can differ.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_user_id UUID;

-- Backfill: one workspace per existing user, with that user as owner.
INSERT INTO public.workspaces (id, name, created_by)
SELECT u.id, COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) || '''s workspace', u.id
  FROM public.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT u.id, u.id, 'owner'
  FROM public.users u
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Same lock-down as 002: the backend uses the service role; nobody else
-- gets anything.
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspaces, public.workspace_members, public.workspace_invites FROM anon, authenticated;
