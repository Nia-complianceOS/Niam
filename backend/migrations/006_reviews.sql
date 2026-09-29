-- 006 — the two-stage approval workflow.
--
-- Legal reviews a drafted fix first: edits the wording, asks the AI to
-- redo it, approves it, or declares it not required. The owner then gives
-- final approval, and only that opens the pull request. Review state
-- lives here, not in the graph: approvals, versions and events are
-- relational and append-only. The :Gap keeps a mirrored status so a
-- re-scan does not reopen a finding under review.
--
-- Only remediation_reviews.state (and its bookkeeping columns) ever
-- changes. draft_versions and review_events are append-only.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.remediation_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    gap_id TEXT NOT NULL,
    gap_title TEXT,
    state TEXT NOT NULL CHECK (state IN (
        'in_legal_review', 'legal_approved', 'owner_approved', 'pr_opened',
        'pending_owner_ack', 'dismissed', 'risk_accepted'
    )),
    current_version_id UUID,
    -- {"legal": {"user_id","by","at","version_no"}, "owner": {...}}
    approvals JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- For "not required": which outcome legal proposed and why.
    proposed_outcome TEXT CHECK (proposed_outcome IN ('dismissed', 'risk_accepted')),
    outcome_reason TEXT,
    review_by DATE,
    pr_id TEXT,
    pr_url TEXT,
    last_error TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Optimistic concurrency token: every transition is
    -- UPDATE ... WHERE id = $id AND updated_at = $seen, so two people
    -- approving at once gives one winner and one clear message.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One live review per finding. A finished one (pr_opened, dismissed,
-- risk_accepted) does not block a new review if the finding comes back.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_live_per_gap
    ON public.remediation_reviews (workspace_id, gap_id)
 WHERE state IN ('in_legal_review', 'legal_approved', 'owner_approved', 'pending_owner_ack');
CREATE INDEX IF NOT EXISTS idx_reviews_workspace_state
    ON public.remediation_reviews (workspace_id, state);

CREATE TABLE IF NOT EXISTS public.draft_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.remediation_reviews(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    version_no INT NOT NULL,
    author_kind TEXT NOT NULL CHECK (author_kind IN ('ai', 'human')),
    author_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name TEXT,
    parent_version_id UUID,
    -- [{"file_path", "document", "summary"}] -- one entry per amended file.
    documents JSONB NOT NULL,
    instructions TEXT,
    -- Advisory checks on a human edit (see review_service.analyse_edit).
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (review_id, version_no)
);

CREATE TABLE IF NOT EXISTS public.review_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.remediation_reviews(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    comment TEXT,
    from_state TEXT,
    to_state TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_events_review ON public.review_events (review_id, at);

ALTER TABLE public.remediation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remediation_reviews, public.draft_versions, public.review_events FROM anon, authenticated;
