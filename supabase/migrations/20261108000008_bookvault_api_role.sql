-- ==============================================
-- Migration: Non-superuser database role for FastAPI (B0.4, AC-05, CS-06)
-- Date: 2026-11-08
--
-- Why:
--   FastAPI connected as postgres (BYPASSRLS), so a repository that forgot its
--   business_id filter leaked other tenants' rows. From now on it connects as
--   bookvault_api: LOGIN, no SUPERUSER, no BYPASSRLS, only the privileges
--   listed here. Tenant policies follow in 20261108000009.
--
--   * Password: NOT set here. Set it at deploy time from the environment:
--       echo "ALTER ROLE bookvault_api PASSWORD :'pw';" |
--         psql "$ADMIN_DATABASE_URL" -v pw="$BOOKVAULT_API_DB_PASSWORD"
--     (backend/scripts/set_api_role_password.sh). Until then the role cannot log in.
--   * Roles are cluster-wide, so creation is idempotent (the test database
--     lives in the same cluster).
--   * postgres gets SET (not INHERIT) on the role, so tests and admins can
--     `SET LOCAL ROLE bookvault_api` without gaining its privileges implicitly.
--   * No GRANT ALL and no default privileges: every later migration grants
--     bookvault_api exactly what its tables need.
--   * prevent_super_admin_manual_assignment(): a direct login has
--     current_setting('role') = 'none', which the old allow-list accepted, so
--     bookvault_api could have assigned super_admin. It now resolves the
--     effective role (session_user when no SET ROLE is active) and 'none' is gone.
--     The trigger now also fires on UPDATE OF role_id (it was INSERT only).
--
-- ROLLBACK (run manually):
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bookvault_api;
--   REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM bookvault_api;
--   REVOKE ALL ON SCHEMA public, extensions FROM bookvault_api;
--   DROP OWNED BY bookvault_api; DROP ROLE bookvault_api;  -- once no database uses it
--   Restore prevent_super_admin_manual_assignment() from 20260201000001 (allow-list incl. 'none')
--   and its trigger as BEFORE INSERT only.
-- ==============================================

-- 1. The role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bookvault_api') THEN
        CREATE ROLE bookvault_api LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
            NOINHERIT NOREPLICATION;
    END IF;
END
$$;
ALTER ROLE bookvault_api SET statement_timeout = '30s';
ALTER ROLE bookvault_api SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE bookvault_api SET search_path = public, extensions;
GRANT bookvault_api TO postgres WITH INHERIT FALSE, SET TRUE;

-- 2. Schemas
GRANT USAGE ON SCHEMA public, extensions TO bookvault_api;
-- auth.users has RLS without policies (Supabase-owned): the API reads accounts only
-- through the filtered view private.accounts (20261108000009).

-- 3. Reference data (read-only)
GRANT SELECT ON public.modules, public.areas, public.area_rights, public.access_presets,
                public.access_preset_rights, public.member_statuses,
                public.platform_settings
    TO bookvault_api;

-- 4. Platform tables (row access limited by policies in 20261108000009)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles, public.user_roles,
                                       public.admin_tabs
    TO bookvault_api;
GRANT SELECT, UPDATE ON public.user_profiles TO bookvault_api;
GRANT SELECT, INSERT ON public.audit_logs TO bookvault_api;

-- 5. Business tables
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.businesses, public.business_details, public.business_format, public.business_tabs,
    public.business_tab_columns, public.business_members, public.business_member_area_access,
    public.coa_groups, public.coa_accounts, public.bank_accounts, public.customers,
    public.suppliers, public.receipts
    TO bookvault_api;
-- Rows are inserted or deleted, never updated (trigger bmaa_no_update).
REVOKE UPDATE ON public.business_member_area_access FROM bookvault_api;

-- 6. Functions the API calls directly or through column defaults
GRANT EXECUTE ON FUNCTION public.uuid_generate_v7(timestamptz) TO bookvault_api;
GRANT EXECUTE ON FUNCTION public.member_has_area_access(uuid, uuid, text, text) TO bookvault_api;
GRANT EXECUTE ON FUNCTION public.recalculate_bank_account_balance(uuid) TO bookvault_api;

-- 7. super_admin can only be assigned by trusted server roles, never by the API role
CREATE OR REPLACE FUNCTION public.prevent_super_admin_manual_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- SET ROLE wins; with a direct login the role setting is 'none' and session_user counts.
    effective_role TEXT := CASE WHEN current_setting('role') = 'none'
                                THEN session_user::text ELSE current_setting('role') END;
BEGIN
    IF (SELECT r.name FROM public.roles r WHERE r.id = NEW.role_id) = 'super_admin'
       AND effective_role NOT IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
        RAISE EXCEPTION 'Super admin role cannot be assigned directly. Use the admin API.';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_super_admin_manual_assignment() FROM PUBLIC;

-- The trigger only covered INSERT, so an UPDATE of role_id could promote anyone.
DROP TRIGGER IF EXISTS prevent_manual_super_admin_assignment ON public.user_roles;
CREATE TRIGGER prevent_manual_super_admin_assignment
    BEFORE INSERT OR UPDATE OF role_id ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_manual_assignment();
