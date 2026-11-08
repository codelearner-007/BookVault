-- ==============================================
-- Migration: Auth settings, business 2FA rule, GoTrue audit ingest (B0.7)
-- Date: 2026-11-08
--
-- Why (build-plan B0.7, L1, H1; AC-30, AC-36):
--   * platform_settings.mfa_required_for_super_admin (default true): platform
--     routes refuse a super admin session below AAL2.
--   * business_settings: one row per business (B1 adds the ledger columns).
--     require_member_mfa is checked per membership on every business route,
--     so one user can belong to businesses with different rules.
--   * GoTrue writes auth.audit_log_entries for every sign-in path, including
--     direct calls with the public anon key. ingest_auth_audit_log() copies the
--     events that matter into audit_logs (scope platform, email hashed),
--     idempotent on the GoTrue entry id (audit_logs.source_event_id).
--   * password_verification_attempt_hook(): GoTrue hook that audits failed
--     password checks (login_failed) and sign-in attempts of banned accounts.
--     It never blocks a sign-in (decision continue); rate limits do that.
--   * Sign-in methods are not a platform setting: they come from env
--     (AUTH_METHODS), so no list is stored in a single column (1NF).
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.password_verification_attempt_hook(jsonb);
--   DROP FUNCTION public.ingest_auth_audit_log(integer);
--   DROP INDEX public.uq_audit_logs_source_event_id, public.idx_audit_logs_source_created;
--   ALTER TABLE public.audit_logs DROP COLUMN source_event_id;
--   DROP TRIGGER businesses_create_settings ON public.businesses;
--   DROP FUNCTION public.create_business_settings();
--   DROP TABLE public.business_settings;
--   DROP FUNCTION public.platform_setting_bool(text);
--   DELETE FROM public.platform_settings WHERE key = 'mfa_required_for_super_admin';
-- ==============================================

-- 1. Platform setting
INSERT INTO public.platform_settings (key, value_type, bool_value)
VALUES ('mfa_required_for_super_admin', 'boolean', true)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_setting_bool(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.bool_value FROM public.platform_settings s
    WHERE s.key = p_key AND s.value_type = 'boolean';
$$;
REVOKE EXECUTE ON FUNCTION public.platform_setting_bool(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_setting_bool(text) TO bookvault_api;

-- 2. Business settings (singleton per business)
CREATE TABLE public.business_settings (
    business_id        UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
    require_member_mfa BOOLEAN NOT NULL DEFAULT false,
    version            INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_settings IS
    'One row per business (B0.7). require_member_mfa: members other than the owner need AAL2.';

INSERT INTO public.business_settings (business_id)
SELECT id FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_business_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.business_settings (business_id) VALUES (NEW.id)
    ON CONFLICT (business_id) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_business_settings() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER businesses_create_settings
    AFTER INSERT ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.create_business_settings();

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.business_settings TO bookvault_api;
CREATE POLICY business_settings_api_select ON public.business_settings FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id));

-- 3. GoTrue audit ingest
ALTER TABLE public.audit_logs ADD COLUMN source_event_id UUID NULL;
COMMENT ON COLUMN public.audit_logs.source_event_id IS
    'auth.audit_log_entries.id of an ingested GoTrue event (idempotency key); NULL otherwise.';
CREATE UNIQUE INDEX uq_audit_logs_source_event_id
    ON public.audit_logs (source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_audit_logs_source_created
    ON public.audit_logs (created_at) WHERE source_event_id IS NOT NULL;

-- Copies new GoTrue events (oldest first, at most p_batch) and returns how many were added.
-- The cursor overlaps by one minute; entries already copied are skipped (and the unique
-- source_event_id still drops a concurrent repeat).
CREATE OR REPLACE FUNCTION public.ingest_auth_audit_log(p_batch integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_since timestamptz;
    v_added integer;
BEGIN
    SELECT max(created_at) - interval '1 minute' INTO v_since
    FROM public.audit_logs WHERE source_event_id IS NOT NULL;

    INSERT INTO public.audit_logs
        (scope, user_id, action, entity_type, entity_id, details, created_at, source_event_id)
    SELECT 'platform', NULLIF(e.payload->>'actor_id', '')::uuid, m.event, 'Auth',
           NULLIF(e.payload->>'actor_id', ''),
           jsonb_build_object(
               'source', 'gotrue',
               'gotrue_action', m.action,
               'email_hash', encode(extensions.digest(lower(COALESCE(e.payload->>'actor_username', '')), 'sha256'), 'hex'),
               'ip', NULLIF(e.ip_address, '')),
           e.created_at, e.id
    FROM auth.audit_log_entries e
    JOIN (VALUES
        ('user_signedup', 'signup'),
        ('user_repeated_signup', 'signup_existing_email'),
        ('login', 'login_succeeded'),
        ('mfa_code_login', 'mfa_login_succeeded'),
        ('logout', 'logout'),
        ('user_recovery_requested', 'password_reset_requested'),
        ('user_updated_password', 'password_changed'),
        ('factor_unenrolled', 'mfa_disabled'),
        ('factor_deleted', 'mfa_factor_deleted'),
        ('user_deleted', 'account_deleted')
    ) AS m(action, event) ON m.action = e.payload->>'action'
    WHERE (v_since IS NULL OR e.created_at >= v_since)
      AND NOT EXISTS (SELECT 1 FROM public.audit_logs a WHERE a.source_event_id = e.id)
    ORDER BY e.created_at, e.id
    LIMIT p_batch
    ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING;

    GET DIAGNOSTICS v_added = ROW_COUNT;
    RETURN v_added;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ingest_auth_audit_log(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_auth_audit_log(integer) TO bookvault_api;

-- 4. GoTrue password verification hook (config.toml [auth.hook.password_verification_attempt])
CREATE OR REPLACE FUNCTION public.password_verification_attempt_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := NULLIF(event->>'user_id', '')::uuid;
    v_action text;
BEGIN
    IF COALESCE((event->>'valid')::boolean, false) = false THEN
        v_action := 'login_failed';
    ELSIF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id AND u.banned_until > now()) THEN
        v_action := 'banned_login_attempt';
    END IF;

    IF v_action IS NOT NULL THEN
        BEGIN
            INSERT INTO public.audit_logs (scope, user_id, action, entity_type, entity_id, details)
            VALUES ('platform', v_user_id, v_action, 'Auth', v_user_id::text,
                    jsonb_build_object('source', 'gotrue_hook'));
        EXCEPTION WHEN OTHERS THEN
            -- Auditing must never block a sign-in; the GoTrue rate limits still apply.
            RAISE WARNING 'password_verification_attempt_hook audit failed: %', SQLERRM;
        END;
    END IF;
    RETURN jsonb_build_object('decision', 'continue');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.password_verification_attempt_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_verification_attempt_hook(jsonb) TO supabase_auth_admin;
