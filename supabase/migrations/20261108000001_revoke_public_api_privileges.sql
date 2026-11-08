-- ==============================================
-- Migration: Close direct PostgREST access (B0.2: CS-07)
-- Date: 2026-11-08
--
-- Why:
--   Supabase default privileges gave anon/authenticated ALL on every public
--   table, sequence and function, and the "Admins can ..." policies trusted the
--   JWT user_role claim, which every self-signup carries as admin (CS-03). Any
--   signed-up user could read or modify all profiles and user_roles through
--   /rest/v1, and anon could call SECURITY DEFINER functions through RPC.
--   The app never uses PostgREST for tables: FastAPI connects as the DB owner
--   and the Next.js user-admin routes use the service role.
--
-- After this migration:
--   * anon/authenticated hold no privilege on public tables, sequences or
--     functions, now or for objects postgres creates later;
--   * the "Admins can ..." policies are gone (own-row policies stay; without
--     grants they are inert until B0.4 adds tenant RLS);
--   * the suspense materialized view lives in the non-exposed schema private.
--
-- Not covered: default privileges owned by supabase_admin (postgres may not
-- alter them). Objects supabase_admin creates in public need their own revoke.
--
-- ROLLBACK (run manually):
--   ALTER MATERIALIZED VIEW private.business_suspense_balance SET SCHEMA public;
--   DROP SCHEMA IF EXISTS private;
--   GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, PUBLIC;
--   REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, PUBLIC;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, PUBLIC;
--   Recreate the four dropped policies from 20260201000001_rbac_and_auth_system.sql.
-- ==============================================

-- 1. Policies that trusted the JWT role claim
DROP POLICY IF EXISTS "Admins can view all profiles"   ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles"     ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can manage user roles"   ON public.user_roles;

-- 2. No direct API privileges on existing objects
REVOKE ALL     ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL     ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- The auth hook keeps its explicit grant (restated so this file stands alone).
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- 3. Nor on objects postgres creates later (future migrations)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- 4. Suspense materialized view out of the exposed schema (a matview has no RLS)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
ALTER MATERIALIZED VIEW public.business_suspense_balance SET SCHEMA private;
GRANT SELECT ON private.business_suspense_balance TO service_role;
