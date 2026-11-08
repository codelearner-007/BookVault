-- ==============================================
-- Migration: audit_logs evolved in place (B0.5, NA-11, CS-17, AC-24)
-- Date: 2026-11-08
--
-- One append-only table for platform and business events:
--   scope        'platform' | 'business'; business_id NOT NULL exactly when scope = 'business'.
--   business_id  no FK: a business row's audit trail outlives the business (B0.8 purge).
--   entity_type  renamed from module; entity_id renamed from resource_id.
--   before/after JSON snapshots of the record; request_id ties a row to the request log.
--   user_id      the actor. Its FK to auth.users is dropped: ON DELETE SET NULL would
--                rewrite history, and the actor id must survive a deleted account.
-- UPDATE/DELETE/TRUNCATE are blocked by triggers for everyone except the B0.8 purge
-- function's owner (bookvault_purge); the API role gets SELECT/INSERT only.
--
-- Backfill: rows whose details name a business (or business rows themselves) become
-- scope 'business'.
--
-- ROLLBACK (run manually):
--   DROP TRIGGER audit_logs_append_only ON public.audit_logs;
--   DROP TRIGGER audit_logs_no_truncate ON public.audit_logs;
--   DROP FUNCTION public.audit_logs_append_only();
--   ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_scope_business;
--   ALTER TABLE public.audit_logs DROP COLUMN scope, DROP COLUMN business_id, DROP COLUMN before,
--     DROP COLUMN after, DROP COLUMN request_id;
--   ALTER TABLE public.audit_logs RENAME COLUMN entity_type TO module;
--   ALTER TABLE public.audit_logs RENAME COLUMN entity_id TO resource_id;
--   ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
--   Recreate audit_logs_api_select / audit_logs_api_insert from 20261108000009.
-- ==============================================

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs RENAME COLUMN module TO entity_type;
ALTER TABLE public.audit_logs RENAME COLUMN resource_id TO entity_id;
ALTER TABLE public.audit_logs
    ADD COLUMN scope       TEXT NOT NULL DEFAULT 'platform'
                           CONSTRAINT audit_logs_scope_values CHECK (scope IN ('platform', 'business')),
    ADD COLUMN business_id UUID NULL,
    ADD COLUMN before      JSONB NULL,
    ADD COLUMN after       JSONB NULL,
    ADD COLUMN request_id  TEXT NULL CHECK (char_length(request_id) <= 64);

UPDATE public.audit_logs
SET scope = 'business',
    business_id = COALESCE(
        CASE WHEN details->>'business_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN (details->>'business_id')::uuid END,
        CASE WHEN entity_type = 'businesses'
              AND entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN entity_id::uuid END)
WHERE details->>'business_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR (entity_type = 'businesses'
       AND entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_scope_business CHECK ((scope = 'business') = (business_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON public.audit_logs (business_id, created_at DESC)
    WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_scope_created ON public.audit_logs (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);

-- Append-only
CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user = 'bookvault_purge' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_logs_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();
CREATE TRIGGER audit_logs_no_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_append_only();

REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM bookvault_api;
GRANT SELECT, INSERT ON public.audit_logs TO bookvault_api;

-- Read: own actions, the business history (history:view), or the live super admin.
-- Insert: always as myself; a business row only for a business I can see.
DROP POLICY IF EXISTS audit_logs_api_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_api_insert ON public.audit_logs;
CREATE POLICY audit_logs_api_select ON public.audit_logs FOR SELECT TO bookvault_api
    USING (user_id = public.app_user_id()
           OR public.is_platform_super_admin()
           OR (scope = 'business' AND public.has_area_access(business_id, 'history', 'view')));
CREATE POLICY audit_logs_api_insert ON public.audit_logs FOR INSERT TO bookvault_api
    WITH CHECK (user_id = public.app_user_id()
                AND (scope = 'platform'
                     OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = audit_logs.business_id)));
