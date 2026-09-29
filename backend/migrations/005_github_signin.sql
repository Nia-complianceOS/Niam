-- 005 — sign in with GitHub.
--
-- A GitHub sign-in creates an account with no password, stores the
-- GitHub identity, and stores the repository connection at the same
-- time, so the Repositories page is already connected.
--
-- Identities are keyed on GitHub's numeric user id, never the login:
-- logins can be renamed and then claimed by somebody else.
--
-- A GitHub email that matches an existing password account is NOT linked
-- automatically (that is an account-takeover path). The user signs in
-- with the password and connects GitHub, which links the identity.
--
-- Safe to re-run.

ALTER TABLE public.users ALTER COLUMN hashed_password DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_identities (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    login TEXT,
    email TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON public.user_identities(user_id);

-- One flow, two purposes. `login` states have no user; `connect` states
-- belong to the signed-in user. browser_binding is the SHA-256 of a
-- verifier the SPA keeps in sessionStorage, so the flow can only be
-- finished in the browser that started it (the defence against login
-- CSRF and against sending someone your connect link).
ALTER TABLE public.oauth_states ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.oauth_states ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'connect';
ALTER TABLE public.oauth_states ADD COLUMN IF NOT EXISTS browser_binding TEXT;

-- What the callback learned, parked for up to two minutes until the SPA
-- redeems it with the verifier. The callback never puts a JWT or a
-- GitHub token in a URL; it puts a one-time code, stored hashed.
CREATE TABLE IF NOT EXISTS public.oauth_completions (
    code_hash TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    browser_binding TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    github_user_id TEXT NOT NULL,
    login TEXT,
    avatar_url TEXT,
    email TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    name TEXT,
    token_encrypted TEXT NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- consume_oauth_state now returns the purpose and binding too.
DROP FUNCTION IF EXISTS public.consume_oauth_state(TEXT);
CREATE FUNCTION public.consume_oauth_state(p_state TEXT)
RETURNS TABLE (user_id UUID, purpose TEXT, browser_binding TEXT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    DELETE FROM public.oauth_states
     WHERE state = p_state
       AND expires_at > now()
    RETURNING oauth_states.user_id, oauth_states.purpose, oauth_states.browser_binding;
$$;
REVOKE ALL ON FUNCTION public.consume_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(TEXT) TO service_role;

-- Redeem a completion code atomically, refusing expired ones.
CREATE OR REPLACE FUNCTION public.consume_oauth_completion(p_code_hash TEXT)
RETURNS SETOF public.oauth_completions
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    DELETE FROM public.oauth_completions
     WHERE code_hash = p_code_hash
       AND expires_at > now()
    RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.consume_oauth_completion(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_completion(TEXT) TO service_role;

ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_identities, public.oauth_completions FROM anon, authenticated;
