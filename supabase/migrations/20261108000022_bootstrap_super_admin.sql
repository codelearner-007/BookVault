-- ==============================================
-- Migration: Bootstrap super admin promotion is audited (B0.7, D-29, AC-41)
-- Date: 2026-11-08
--
-- The rule itself is unchanged from 20261108000003_platform_role_member.sql:
-- only a confirmed self-signup whose email equals
-- platform_settings.bootstrap_super_admin_email (case-insensitive), never an
-- email change, never a provisioned account, only while no super admin exists,
-- serialized by the advisory lock. The promotion now writes the platform audit
-- event bootstrap_super_admin_promoted.
--
-- ROLLBACK (run manually):
--   Restore public.promote_bootstrap_super_admin() from
--   20261108000003_platform_role_member.sql.
-- ==============================================

CREATE OR REPLACE FUNCTION public.promote_bootstrap_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    bootstrap_email TEXT;
BEGIN
    -- Only the confirmation event or the first login, never an email change.
    IF NEW.email_confirmed_at IS NULL OR NEW.email IS DISTINCT FROM OLD.email THEN
        RETURN NEW;
    END IF;
    IF OLD.email_confirmed_at IS NOT NULL AND OLD.last_sign_in_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT lower(btrim(text_value)) INTO bootstrap_email
    FROM public.platform_settings WHERE key = 'bootstrap_super_admin_email';
    IF bootstrap_email IS NULL OR bootstrap_email = '' OR lower(NEW.email) <> bootstrap_email THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_profiles p
               WHERE p.user_id = NEW.id AND p.is_provisioned) THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(1234567890);
    IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
               WHERE r.name = 'super_admin') THEN
        RETURN NEW;
    END IF;

    UPDATE public.user_roles
    SET role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
    WHERE user_id = NEW.id;

    INSERT INTO public.audit_logs (scope, user_id, action, entity_type, entity_id, details)
    VALUES ('platform', NEW.id, 'bootstrap_super_admin_promoted', 'User', NEW.id::text,
            jsonb_build_object('trigger', CASE WHEN OLD.email_confirmed_at IS NULL
                                               THEN 'email_confirmed' ELSE 'first_login' END));
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promote_bootstrap_super_admin() FROM authenticated, anon, PUBLIC;
