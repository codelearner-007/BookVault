-- ==============================================
-- Migration: audited permanent business purge (B0.8, NA-09, AC-23)
-- Date: 2026-11-08
--
-- Soft delete (Trash) stays the normal path. Permanent deletion goes through
-- public.purge_business(), the only path past the append-only / owner-membership
-- triggers:
--   * owned by the NOLOGIN role bookvault_purge (BYPASSRLS, so it sees every row of
--     the business); EXECUTE for bookvault_api only;
--   * re-checks what FastAPI checked: caller = p_actor = owner, business in Trash,
--     typed confirmation equals the business name (re-auth and "export offered" are
--     request facts, checked in FastAPI only);
--   * deletes every business-scoped row children first (incl. the business's audit
--     rows), then the business, then writes ONE platform audit row
--     (action business_purged, actor, business id and name, per-table row counts,
--     request id) that survives the purge.
-- public.export_business() returns every business-scoped row as JSON (owner only),
-- offered before the purge.
-- audit_logs_append_only(): the purge role may DELETE only (no UPDATE, no TRUNCATE).
-- protect_owner_member(): the owner membership may be deleted only by the purge role.
-- businesses.owner_id stays ON DELETE RESTRICT (20261108000000).
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.purge_business(uuid, uuid, text, text);
--   DROP FUNCTION public.export_business(uuid);
--   DROP FUNCTION public.business_scoped_tables();
--   Restore audit_logs_append_only() from 20261108000013 and protect_owner_member()
--   from 20261108000007.
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bookvault_purge;
--   REVOKE ALL ON SCHEMA public FROM bookvault_purge; DROP ROLE bookvault_purge;
-- ==============================================

-- 1. The owner role
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bookvault_purge') THEN
        CREATE ROLE bookvault_purge NOLOGIN BYPASSRLS NOINHERIT;
    END IF;
END
$$;
GRANT bookvault_purge TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public TO bookvault_purge;
GRANT SELECT, DELETE ON
    public.businesses, public.business_details, public.business_format, public.business_tabs,
    public.business_tab_columns, public.business_members, public.business_member_area_access,
    public.coa_groups, public.coa_accounts, public.bank_accounts, public.customers,
    public.suppliers, public.receipts, public.idempotency_keys
    TO bookvault_purge;
GRANT SELECT, INSERT, DELETE ON public.audit_logs TO bookvault_purge;
GRANT SELECT ON public.member_statuses TO bookvault_purge;
GRANT EXECUTE ON FUNCTION public.app_user_id(), public.uuid_generate_v7(timestamptz) TO bookvault_purge;

-- 2. Triggers: the purge role is the only exception, and only for DELETE
CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_user = 'bookvault_purge' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    is_owner_row BOOLEAN := EXISTS (
        SELECT 1 FROM public.businesses b WHERE b.id = OLD.business_id AND b.owner_id = OLD.user_id
    );
BEGIN
    IF NOT is_owner_row THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF current_user = 'bookvault_purge' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'the owner membership cannot be removed' USING ERRCODE = '23514';
    END IF;
    IF NEW.user_id <> OLD.user_id OR NEW.business_id <> OLD.business_id
       OR NEW.access_mode <> 'full'
       OR NEW.status_id <> (SELECT id FROM public.member_statuses WHERE key = 'active') THEN
        RAISE EXCEPTION 'the owner membership must stay full and active' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Business-scoped tables, children first (the delete order; export uses the same list)
CREATE OR REPLACE FUNCTION public.business_scoped_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY[
        'business_member_area_access', 'idempotency_keys', 'receipts', 'bank_accounts',
        'customers', 'suppliers', 'coa_accounts', 'coa_groups', 'business_tab_columns',
        'business_tabs', 'business_format', 'business_details', 'business_members', 'audit_logs'
    ];
$$;

-- 4. Export (owner only, active or in Trash)
CREATE OR REPLACE FUNCTION public.export_business(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_table text;
    v_rows jsonb;
    v_export jsonb;
BEGIN
    SELECT jsonb_build_object('businesses', jsonb_build_array(to_jsonb(b)))
    INTO v_export
    FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = public.app_user_id();
    IF v_export IS NULL THEN
        RAISE EXCEPTION 'business not found' USING ERRCODE = 'no_data_found';
    END IF;

    FOREACH v_table IN ARRAY public.business_scoped_tables() LOOP
        EXECUTE format(
            'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t'
            ' WHERE t.business_id = $1', v_table)
        INTO v_rows USING p_business_id;
        v_export := v_export || jsonb_build_object(v_table, v_rows);
    END LOOP;
    RETURN v_export;
END;
$$;

-- 5. Purge
CREATE OR REPLACE FUNCTION public.purge_business(
    p_business_id uuid, p_actor uuid, p_confirmation text, p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name text;
    v_deleted_at timestamptz;
    v_table text;
    v_count bigint;
    v_counts jsonb := '{}'::jsonb;
BEGIN
    IF p_actor IS NULL OR p_actor IS DISTINCT FROM public.app_user_id() THEN
        RAISE EXCEPTION 'purge must be run by the calling user' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT b.name, b.deleted_at INTO v_name, v_deleted_at
    FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = p_actor;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'business not found' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_deleted_at IS NULL THEN
        RAISE EXCEPTION 'business must be in Trash' USING ERRCODE = 'check_violation';
    END IF;
    IF p_confirmation IS DISTINCT FROM v_name THEN
        RAISE EXCEPTION 'confirmation does not match the business name' USING ERRCODE = 'check_violation';
    END IF;

    FOREACH v_table IN ARRAY public.business_scoped_tables() LOOP
        EXECUTE format('DELETE FROM public.%I WHERE business_id = $1', v_table) USING p_business_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_counts := v_counts || jsonb_build_object(v_table, v_count);
    END LOOP;
    DELETE FROM public.businesses WHERE id = p_business_id;
    v_counts := v_counts || jsonb_build_object('businesses', 1);

    INSERT INTO public.audit_logs (scope, user_id, action, entity_type, entity_id, details, request_id)
    VALUES ('platform', p_actor, 'business_purged', 'Business', p_business_id::text,
            jsonb_build_object('business_id', p_business_id, 'name', v_name, 'row_counts', v_counts),
            p_request_id);
    RETURN v_counts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.business_scoped_tables(), public.export_business(uuid),
    public.purge_business(uuid, uuid, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_scoped_tables() TO bookvault_purge;
GRANT EXECUTE ON FUNCTION public.export_business(uuid), public.purge_business(uuid, uuid, text, text)
    TO bookvault_api;

-- Ownership last (postgres holds SET, not INHERIT, on the role). ALTER ... OWNER needs
-- CREATE on the schema for the new owner, granted only for these statements.
GRANT CREATE ON SCHEMA public TO bookvault_purge;
ALTER FUNCTION public.business_scoped_tables() OWNER TO bookvault_purge;
ALTER FUNCTION public.export_business(uuid) OWNER TO bookvault_purge;
ALTER FUNCTION public.purge_business(uuid, uuid, text, text) OWNER TO bookvault_purge;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;
