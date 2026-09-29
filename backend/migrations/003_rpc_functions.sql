-- 003 — the two RPCs the code already calls, and "one active scan per
-- account" enforced by the database instead of by a check-then-insert.
--
-- The backend has always called append_scan_log and consume_oauth_state
-- and fallen back when they were missing. The fallback for the scan log
-- is a read-then-write that loses entries under concurrency; the fallback
-- for OAuth state checks expiry in Python after the delete. Both work,
-- neither is atomic.
--
-- Safe to re-run.

-- 1. Atomic append to a scan's progress log.
CREATE OR REPLACE FUNCTION public.append_scan_log(
    p_scan_id TEXT,
    p_user_id TEXT,
    p_event JSONB
) RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    UPDATE public.scans
       SET log = COALESCE(log, '[]'::jsonb) || jsonb_build_array(p_event),
           updated_at = now()
     WHERE id = p_scan_id
       AND user_id::text = p_user_id;
$$;

-- 2. Redeem an OAuth state: delete and return it in one statement, and
--    refuse an expired one inside SQL. Returns zero rows for unknown,
--    reused or expired states alike. The extra columns come from
--    migration 005; this definition is replaced there.
CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_state TEXT)
RETURNS TABLE (user_id UUID)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    DELETE FROM public.oauth_states
     WHERE state = p_state
       AND expires_at > now()
    RETURNING oauth_states.user_id;
$$;

REVOKE ALL ON FUNCTION public.append_scan_log(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_oauth_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_scan_log(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(TEXT) TO service_role;

-- 3. One queued/running scan per account. The API used to count running
--    scans and then insert, so two simultaneous POSTs both passed. The
--    backend retires scans with no progress for 30 minutes before
--    inserting (scan_store.create), so a crashed scan cannot hold the
--    slot forever.
--
--    If this fails with "could not create unique index", an account
--    already has two active rows. Mark the older ones failed first:
--      UPDATE scans SET status = 'failed', error = 'superseded'
--       WHERE status IN ('queued','running')
--         AND id NOT IN (SELECT DISTINCT ON (user_id) id FROM scans
--                         WHERE status IN ('queued','running')
--                         ORDER BY user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS scans_one_active_per_user
    ON public.scans (user_id)
 WHERE status IN ('queued', 'running');
