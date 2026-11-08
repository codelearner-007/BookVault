-- ==============================================
-- Migration: Tenant-scoped RLS for the API role (B0.4, AC-04, AC-05; platform-model 5.2)
-- Date: 2026-11-08
--
-- Why:
--   RLS becomes the second layer behind the FastAPI access dependency. Every
--   request runs SET LOCAL app.user_id (the verified JWT subject) inside its
--   transaction; a query without that setting sees no tenant rows.
--
-- Helpers (SECURITY DEFINER STABLE, search_path '', owned by the NOLOGIN
-- BYPASSRLS role bookvault_rls_owner, EXECUTE for bookvault_api only). They read
-- membership tables with RLS bypassed, so no policy re-enters another (no recursion):
--   app_user_id()                       NULLIF(current_setting('app.user_id', true), '')::uuid.
--                                       '' appears on pooled connections after a SET LOCAL ends.
--   is_business_member(b)               owner or active member of a non-deleted business.
--   has_area_access(b, area, right)     the EXACT right (D-39) via member_has_area_access()
--                                       (B0.3, now owned by bookvault_rls_owner); unknown
--                                       area/right or a non-view right on a view-only area -> false.
--   has_area_write_access(b, area)      create OR edit OR delete (shared-ledger child rows, B1).
--   is_platform_super_admin()           caller holds super_admin in user_roles.
--   document_update_right(status_id) is created with the documents tables in B1.
--
-- Command -> right (D-39): SELECT view, INSERT create, UPDATE edit, DELETE delete.
-- SELECT also accepts view on the areas whose routes legitimately read a table
-- today (receipts join contact/account names; customer/supplier pages list
-- their receipts; suspense reads receipts). These legacy tables are replaced by
-- the shared ledger in B1/B3, whose pattern (documents.area_key) is fixed in
-- build-plan B0.4; that pattern needs no such list.
--
-- Platform tables: reference rows are readable by the API role; writes and
-- other users' rows only on the live super admin path (or own rows / own
-- created accounts, D-30). platform_settings is reachable only through the two
-- SECURITY DEFINER functions below (exception listed in threat-model.md).
--
-- The suspense materialized view has no RLS: bookvault_api reads it only
-- through business_suspense_balance_for(), which checks suspense:view, and
-- refreshes it through refresh_business_suspense_balance() (REFRESH needs ownership).
--
-- ROLLBACK (run manually):
--   For every table below: DROP POLICY <table>_api_* ON public.<table>;
--     ALTER TABLE public.<table> NO FORCE ROW LEVEL SECURITY;
--   Recreate the dropped legacy policies from 20260201000001 / 20260406000000.
--   ALTER FUNCTION public.member_has_area_access(uuid, uuid, text, text) OWNER TO postgres;
--   DROP FUNCTION public.has_area_write_access(uuid, text), public.has_area_access(uuid, text, text),
--     public.is_business_member(uuid), public.is_platform_super_admin(), public.app_user_id(),
--     public.is_bootstrap_super_admin_email(text), public.set_bootstrap_super_admin_email(text),
--     public.business_suspense_balance_for(uuid), public.refresh_business_suspense_balance();
--   DROP VIEW private.accounts; DROP FUNCTION public.email_has_account(text), public.count_owned_businesses(uuid, boolean);
--   REVOKE USAGE ON SCHEMA private FROM bookvault_api;
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bookvault_rls_owner; DROP ROLE bookvault_rls_owner;
--   (The owner change of the helpers can only be undone by supabase_admin.)
-- ==============================================

-- 1. Helper owner role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bookvault_rls_owner') THEN
        CREATE ROLE bookvault_rls_owner NOLOGIN BYPASSRLS NOINHERIT;
    END IF;
END
$$;
GRANT bookvault_rls_owner TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public TO bookvault_rls_owner;
GRANT SELECT ON public.businesses, public.business_members, public.business_member_area_access,
                public.member_statuses, public.areas, public.modules, public.area_rights,
                public.user_roles, public.roles
    TO bookvault_rls_owner;

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

ALTER FUNCTION public.member_has_area_access(uuid, uuid, text, text) SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((
        SELECT b.owner_id = public.app_user_id() OR EXISTS (
            SELECT 1
            FROM public.business_members bm
            JOIN public.member_statuses s ON s.id = bm.status_id
            WHERE bm.business_id = b.id AND bm.user_id = public.app_user_id() AND s.key = 'active'
        )
        FROM public.businesses b
        WHERE b.id = p_business_id AND b.deleted_at IS NULL
    ), false);
$$;

CREATE OR REPLACE FUNCTION public.has_area_access(p_business_id uuid, p_area_key text, p_right text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.app_user_id() IS NOT NULL
       AND public.member_has_area_access(p_business_id, public.app_user_id(), p_area_key, p_right);
$$;

CREATE OR REPLACE FUNCTION public.has_area_write_access(p_business_id uuid, p_area_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_area_access(p_business_id, p_area_key, 'create')
        OR public.has_area_access(p_business_id, p_area_key, 'edit')
        OR public.has_area_access(p_business_id, p_area_key, 'delete');
$$;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = public.app_user_id() AND r.name = 'super_admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.app_user_id(), public.is_business_member(uuid),
    public.has_area_access(uuid, text, text), public.has_area_write_access(uuid, text),
    public.is_platform_super_admin()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_user_id(), public.is_business_member(uuid),
    public.has_area_access(uuid, text, text), public.has_area_write_access(uuid, text),
    public.is_platform_super_admin()
    TO bookvault_api, bookvault_rls_owner, postgres;
REVOKE EXECUTE ON FUNCTION public.member_has_area_access(uuid, uuid, text, text) FROM PUBLIC;

-- Ownership last (postgres holds SET, not INHERIT, on the role, so it cannot alter
-- the functions afterwards). ALTER ... OWNER needs CREATE on the schema for the new
-- owner, granted only for these statements.
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.member_has_area_access(uuid, uuid, text, text) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.is_business_member(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.has_area_access(uuid, text, text) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.has_area_write_access(uuid, text) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.is_platform_super_admin() OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 3. Platform-settings and suspense access points (postgres-owned SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_bootstrap_super_admin_email(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_settings
        WHERE key = 'bootstrap_super_admin_email' AND text_value IS NOT NULL
          AND lower(btrim(text_value)) = lower(btrim(p_email))
    );
$$;

-- Startup sync of env BOOTSTRAP_SUPER_ADMIN_EMAIL (D-29); NULL clears it.
CREATE OR REPLACE FUNCTION public.set_bootstrap_super_admin_email(p_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.platform_settings (key, value_type, text_value, updated_at)
    VALUES ('bootstrap_super_admin_email', 'text', NULLIF(lower(btrim(p_email)), ''), now())
    ON CONFLICT (key) DO UPDATE SET text_value = EXCLUDED.text_value, updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.business_suspense_balance_for(p_business_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN public.has_area_access(p_business_id, 'suspense', 'view')
                THEN COALESCE((SELECT v.suspense_balance FROM private.business_suspense_balance v
                               WHERE v.business_id = p_business_id), 0)
           END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_business_suspense_balance()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY private.business_suspense_balance;
$$;

REVOKE EXECUTE ON FUNCTION public.is_bootstrap_super_admin_email(text),
    public.set_bootstrap_super_admin_email(text), public.business_suspense_balance_for(uuid),
    public.refresh_business_suspense_balance()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_bootstrap_super_admin_email(text),
    public.set_bootstrap_super_admin_email(text), public.business_suspense_balance_for(uuid),
    public.refresh_business_suspense_balance()
    TO bookvault_api;

-- 3b. Accounts (auth.users is Supabase-owned, RLS on, no policies). The API reads
--     account fields only through this view, which runs as postgres and shows: self,
--     accounts I created (D-30), members of businesses whose members I manage, and
--     every account for the live super admin. Email uniqueness checks use
--     email_has_account(), which answers yes/no only.
CREATE VIEW private.accounts WITH (security_barrier = true) AS
SELECT u.id, u.email, u.created_at, u.updated_at, u.last_sign_in_at, u.email_confirmed_at,
       u.banned_until
FROM auth.users u
WHERE u.id = public.app_user_id()
   OR public.is_platform_super_admin()
   OR EXISTS (SELECT 1 FROM public.user_profiles p
              WHERE p.user_id = u.id AND p.created_by_user_id = public.app_user_id())
   OR EXISTS (SELECT 1 FROM public.business_members bm
              WHERE bm.user_id = u.id
                AND public.has_area_access(bm.business_id, 'settings.members', 'view'));

CREATE OR REPLACE FUNCTION public.email_has_account(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(p_email)));
$$;

-- Platform view of an account (super admin, D-14): how many businesses it owns,
-- without access to the businesses themselves.
CREATE OR REPLACE FUNCTION public.count_owned_businesses(p_user_id uuid, p_include_deleted boolean)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE WHEN p_user_id = public.app_user_id() OR public.is_platform_super_admin()
                THEN (SELECT count(*)::int FROM public.businesses
                      WHERE owner_id = p_user_id AND (p_include_deleted OR deleted_at IS NULL))
           END;
$$;
REVOKE EXECUTE ON FUNCTION public.count_owned_businesses(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_owned_businesses(uuid, boolean) TO bookvault_api;

GRANT USAGE ON SCHEMA private TO bookvault_api;
GRANT SELECT ON private.accounts TO bookvault_api;
REVOKE EXECUTE ON FUNCTION public.email_has_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_has_account(text) TO bookvault_api;

-- 4. Legacy policies: inert since B0.2 revoked the API grants, and they read
--    auth.uid() (JWT claims), which the backend never sets.
DROP POLICY IF EXISTS "Users can view own profile"        ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"      ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own roles"          ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view roles"             ON public.roles;
DROP POLICY IF EXISTS "Users can view own audit logs"     ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert own audit logs" ON public.audit_logs;

-- 5. FORCE RLS on every application table (postgres keeps BYPASSRLS for migrations)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'businesses', 'business_details', 'business_format', 'business_tabs', 'business_tab_columns',
        'business_members', 'business_member_area_access', 'coa_groups', 'coa_accounts',
        'bank_accounts', 'customers', 'suppliers', 'receipts',
        'user_profiles', 'user_roles', 'roles', 'audit_logs',
        'admin_tabs', 'platform_settings',
        'modules', 'areas', 'area_rights', 'access_presets', 'access_preset_rights', 'member_statuses'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
END
$$;

-- 6. Reference data: readable, never written by the API
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'modules', 'areas', 'area_rights', 'access_presets', 'access_preset_rights',
        'member_statuses'
    ] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING (true)',
                       t || '_api_select', t);
    END LOOP;
END
$$;

-- 7. Platform tables
CREATE POLICY roles_api_select ON public.roles FOR SELECT TO bookvault_api USING (true);
CREATE POLICY roles_api_write ON public.roles FOR ALL TO bookvault_api
    USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());
CREATE POLICY admin_tabs_api_select ON public.admin_tabs FOR SELECT TO bookvault_api USING (true);
CREATE POLICY admin_tabs_api_write ON public.admin_tabs FOR ALL TO bookvault_api
    USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());

-- platform_settings: no policy for the API role (functions in section 3 only)

CREATE POLICY user_profiles_api_select ON public.user_profiles FOR SELECT TO bookvault_api
    USING (
        user_id = public.app_user_id()
        OR created_by_user_id = public.app_user_id()
        OR public.is_platform_super_admin()
        -- member list of a business whose members I manage (owner-only area)
        OR EXISTS (SELECT 1 FROM public.business_members bm
                   WHERE bm.user_id = user_profiles.user_id
                     AND public.has_area_access(bm.business_id, 'settings.members', 'view'))
    );
CREATE POLICY user_profiles_api_update ON public.user_profiles FOR UPDATE TO bookvault_api
    USING (user_id = public.app_user_id() OR created_by_user_id = public.app_user_id())
    WITH CHECK (user_id = public.app_user_id() OR created_by_user_id = public.app_user_id());

CREATE POLICY user_roles_api_select ON public.user_roles FOR SELECT TO bookvault_api
    USING (
        user_id = public.app_user_id()
        OR public.is_platform_super_admin()
        OR EXISTS (SELECT 1 FROM public.user_profiles p
                   WHERE p.user_id = user_roles.user_id AND p.created_by_user_id = public.app_user_id())
    );
CREATE POLICY user_roles_api_write ON public.user_roles FOR ALL TO bookvault_api
    USING (public.is_platform_super_admin()) WITH CHECK (public.is_platform_super_admin());

CREATE POLICY audit_logs_api_select ON public.audit_logs FOR SELECT TO bookvault_api
    USING (user_id = public.app_user_id() OR public.is_platform_super_admin());
CREATE POLICY audit_logs_api_insert ON public.audit_logs FOR INSERT TO bookvault_api
    WITH CHECK (user_id = public.app_user_id());

-- 8. Businesses and their shell tables
CREATE POLICY businesses_api_select ON public.businesses FOR SELECT TO bookvault_api
    USING (owner_id = public.app_user_id() OR public.is_business_member(id));
CREATE POLICY businesses_api_insert ON public.businesses FOR INSERT TO bookvault_api
    WITH CHECK (owner_id = public.app_user_id());
-- Details edit needs settings.business_details:edit; soft delete / restore need the
-- owner-only account.businesses:delete.
CREATE POLICY businesses_api_update ON public.businesses FOR UPDATE TO bookvault_api
    USING (public.has_area_access(id, 'account.businesses', 'delete')
           OR (deleted_at IS NULL AND public.has_area_access(id, 'settings.business_details', 'edit')))
    WITH CHECK (public.has_area_access(id, 'account.businesses', 'delete')
                OR (deleted_at IS NULL AND public.has_area_access(id, 'settings.business_details', 'edit')));
CREATE POLICY businesses_api_delete ON public.businesses FOR DELETE TO bookvault_api
    USING (deleted_at IS NOT NULL AND public.has_area_access(id, 'account.businesses', 'delete'));

DO $$
DECLARE
    spec TEXT[];
BEGIN
    -- table, area whose edit right writes it
    FOREACH spec SLICE 1 IN ARRAY ARRAY[
        ['business_details',     'settings.business_details'],
        ['business_format',      'settings.business_details'],
        ['business_tabs',        'settings.customize_tabs'],
        ['business_tab_columns', 'settings.customize_tabs']
    ] LOOP
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR SELECT TO bookvault_api'
            ' USING (public.is_business_member(business_id))', spec[1] || '_api_select', spec[1]);
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR INSERT TO bookvault_api'
            ' WITH CHECK (public.has_area_access(business_id, %3$L, ''edit''))',
            spec[1] || '_api_insert', spec[1], spec[2]);
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR UPDATE TO bookvault_api'
            ' USING (public.has_area_access(business_id, %3$L, ''edit''))'
            ' WITH CHECK (public.has_area_access(business_id, %3$L, ''edit''))',
            spec[1] || '_api_update', spec[1], spec[2]);
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR DELETE TO bookvault_api'
            ' USING (public.has_area_access(business_id, %3$L, ''edit''))',
            spec[1] || '_api_delete', spec[1], spec[2]);
    END LOOP;
END
$$;

-- 9. Membership (non-recursive: the helpers read business_members with RLS bypassed)
CREATE POLICY business_members_api_select ON public.business_members FOR SELECT TO bookvault_api
    USING (user_id = public.app_user_id()
           OR public.has_area_access(business_id, 'settings.members', 'view'));
CREATE POLICY business_members_api_insert ON public.business_members FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id, 'settings.members', 'create'));
CREATE POLICY business_members_api_update ON public.business_members FOR UPDATE TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.members', 'edit')
           OR public.has_area_access(business_id, 'settings.members', 'delete'))
    WITH CHECK (public.has_area_access(business_id, 'settings.members', 'edit')
                OR public.has_area_access(business_id, 'settings.members', 'delete'));
CREATE POLICY business_members_api_delete ON public.business_members FOR DELETE TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.members', 'delete'));

CREATE POLICY bmaa_api_select ON public.business_member_area_access FOR SELECT TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.members', 'view')
           OR EXISTS (SELECT 1 FROM public.business_members bm
                      WHERE bm.id = business_member_id AND bm.user_id = public.app_user_id()));
-- Changing a member's rights deletes and re-inserts rows (edit); adding a member inserts (create).
CREATE POLICY bmaa_api_insert ON public.business_member_area_access FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_access(business_id, 'settings.members', 'create')
                OR public.has_area_access(business_id, 'settings.members', 'edit'));
CREATE POLICY bmaa_api_delete ON public.business_member_area_access FOR DELETE TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.members', 'edit')
           OR public.has_area_access(business_id, 'settings.members', 'delete'));

-- 10. Area tables: SELECT view (on the owning area or a reader area), INSERT create,
--     UPDATE edit, DELETE delete.
DO $$
DECLARE
    spec TEXT[];
    readers TEXT;
BEGIN
    -- table, owning area, other areas whose routes read it (comma separated, may be empty)
    FOREACH spec SLICE 1 IN ARRAY ARRAY[
        ['coa_groups',    'settings.chart_of_accounts', ''],
        ['coa_accounts',  'settings.chart_of_accounts', 'receipts'],
        ['bank_accounts', 'bank_cash_accounts',         'receipts'],
        ['customers',     'customers',                  'receipts'],
        ['suppliers',     'suppliers',                  'receipts'],
        ['receipts',      'receipts',                   'suspense']
    ] LOOP
        SELECT string_agg(format(' OR public.has_area_access(business_id, %L, ''view'')', r), '')
        INTO readers
        FROM unnest(string_to_array(NULLIF(spec[3], ''), ',')) AS r;

        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR SELECT TO bookvault_api'
            ' USING (public.is_business_member(business_id)'
            ' AND (public.has_area_access(business_id, %3$L, ''view'')%4$s))',
            spec[1] || '_api_select', spec[1], spec[2], COALESCE(readers, ''));
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR INSERT TO bookvault_api'
            ' WITH CHECK (public.has_area_access(business_id, %3$L, ''create''))',
            spec[1] || '_api_insert', spec[1], spec[2]);
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR UPDATE TO bookvault_api'
            ' USING (public.has_area_access(business_id, %3$L, ''edit''))'
            ' WITH CHECK (public.has_area_access(business_id, %3$L, ''edit''))',
            spec[1] || '_api_update', spec[1], spec[2]);
        EXECUTE format(
            'CREATE POLICY %1$I ON public.%2$I FOR DELETE TO bookvault_api'
            ' USING (public.has_area_access(business_id, %3$L, ''delete''))',
            spec[1] || '_api_delete', spec[1], spec[2]);
    END LOOP;
END
$$;
