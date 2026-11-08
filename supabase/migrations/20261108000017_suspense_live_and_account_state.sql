-- ==============================================
-- Migration: No global refresh in the request path; live account state (B0.5, CS-13, CS-26, AC-12, AC-13)
-- Date: 2026-11-08
--
--   * The suspense balance is computed for one business on read instead of a
--     materialized view refreshed (for every business) after each receipt write.
--     The view and its refresh function are dropped (derived data only).
--   * my_account_state(): the caller's live ban state and whether a verified MFA
--     factor exists, read per request by FastAPI (stale JWT claims are not trusted).
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.my_account_state();
--   Recreate private.business_suspense_balance, public.refresh_business_suspense_balance()
--   and the previous public.business_suspense_balance_for() from 20260407000016 / 20261108000009.
-- ==============================================

CREATE OR REPLACE FUNCTION public.business_suspense_balance_for(p_business_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN public.has_area_access(p_business_id, 'suspense', 'view')
                THEN COALESCE((
                    SELECT sum((line.value ->> 'amount')::numeric)
                    FROM public.receipts r, LATERAL jsonb_array_elements(r.lines) AS line(value)
                    WHERE r.business_id = p_business_id
                      AND line.value ->> 'account_id' = 'suspense'), 0)
           END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_suspense_balance_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_suspense_balance_for(uuid) TO bookvault_api;

DROP FUNCTION IF EXISTS public.refresh_business_suspense_balance();
DROP MATERIALIZED VIEW IF EXISTS private.business_suspense_balance;

CREATE OR REPLACE FUNCTION public.my_account_state()
RETURNS TABLE (is_banned boolean, has_verified_factor boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(u.banned_until > now(), false),
           EXISTS (SELECT 1 FROM auth.mfa_factors f
                   WHERE f.user_id = u.id AND f.status = 'verified')
    FROM auth.users u
    WHERE u.id = public.app_user_id();
$$;
REVOKE EXECUTE ON FUNCTION public.my_account_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_account_state() TO bookvault_api;
