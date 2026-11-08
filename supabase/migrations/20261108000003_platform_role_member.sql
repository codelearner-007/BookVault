-- ==============================================
-- Migration: Platform role member, provisioned accounts, fail-closed JWT hook (B0.3)
-- Date: 2026-11-08
--
-- Why (user decisions D-01, D-29, D-30):
--   * Users that the super admin or an admin creates for a business they own get
--     platform role member: they can never create businesses and only see the
--     businesses they are members of.
--   * user_profiles.is_provisioned is a fact fixed at creation (immutable). It is
--     stored, not derived from created_by_user_id, because that reference is
--     cleared if the creator's account is ever deleted. A provisioned account can
--     never become super admin.
--   * handle_new_user checks the provisioned flag FIRST. Only the service key can
--     set app_metadata, so a self-signup can never claim it. Every self-signup is
--     admin at insert, including one whose email is the bootstrap email.
--   * The bootstrap super admin role is given only after a self-signup has
--     confirmed its email (or at its first login after confirmation), while no
--     super admin exists, when its email matches
--     platform_settings.bootstrap_super_admin_email case-insensitively (D-29).
--   * The JWT hook fails closed: no user_roles row -> no user_role claim (the old
--     default admin is gone).
--
-- ROLLBACK (run manually):
--   DROP TRIGGER IF EXISTS on_auth_user_bootstrap_check ON auth.users;
--   DROP FUNCTION IF EXISTS public.promote_bootstrap_super_admin();
--   DROP TRIGGER IF EXISTS user_profiles_provisioning_immutable ON public.user_profiles;
--   DROP FUNCTION IF EXISTS public.protect_user_profile_provisioning();
--   ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS created_by_user_id,
--                                    DROP COLUMN IF EXISTS is_provisioned;
--   DELETE FROM public.user_roles WHERE role_id = (SELECT id FROM public.roles WHERE name = 'member');
--   Then restore handle_new_user and custom_access_token_hook from
--   20260418224252_remote_schema.sql. Deleting the system role member needs
--   protect_system_roles disabled for that statement.
-- ==============================================

INSERT INTO public.roles (name, description, hierarchy_level, is_system)
VALUES ('member', 'Business user created by a business owner; cannot create businesses', 50, TRUE)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.user_profiles
    ADD COLUMN is_provisioned BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN created_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_user_profiles_created_by_user_id
    ON public.user_profiles (created_by_user_id) WHERE created_by_user_id IS NOT NULL;

-- is_provisioned never changes; created_by_user_id can only be cleared (creator deleted).
CREATE OR REPLACE FUNCTION public.protect_user_profile_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.is_provisioned IS DISTINCT FROM OLD.is_provisioned THEN
        RAISE EXCEPTION 'user_profiles.is_provisioned is immutable';
    END IF;
    IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       AND NEW.created_by_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'user_profiles.created_by_user_id can only be cleared';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_provisioning_immutable
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_profile_provisioning();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    provisioned_for UUID := NULLIF(NEW.raw_app_meta_data->>'provisioned_for_business', '')::UUID;
    created_by      UUID := NULLIF(NEW.raw_app_meta_data->>'created_by_user_id', '')::UUID;
    role_key        TEXT := 'admin';
BEGIN
    -- 1. Provisioned first: nothing else is evaluated for these accounts.
    IF provisioned_for IS NOT NULL THEN
        IF created_by IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = provisioned_for AND b.owner_id = created_by AND b.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'provisioned account must be created by the owner of the business';
        END IF;
        role_key := 'member';
    ELSE
        created_by := NULL;
    END IF;

    INSERT INTO public.user_profiles (user_id, full_name, is_provisioned, created_by_user_id)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', provisioned_for IS NOT NULL, created_by);

    -- 2. Every self-signup is admin at insert (the bootstrap role comes after confirmation).
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT NEW.id, r.id FROM public.roles r WHERE r.name = role_key;

    RETURN NEW;
END;
$$;

-- Bootstrap super admin (D-29): only a confirmed self-signup, never at insert, while none exists.
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
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_bootstrap_check
    AFTER UPDATE OF email_confirmed_at, last_sign_in_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.promote_bootstrap_super_admin();

-- Fail closed: no role row -> no user_role claim -> every route denies.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    role_name TEXT;
    role_level INTEGER;
BEGIN
    SELECT r.name, r.hierarchy_level INTO role_name, role_level
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = (event->>'user_id')::UUID
    ORDER BY r.hierarchy_level DESC
    LIMIT 1;

    IF role_name IS NULL THEN
        event := event #- '{claims,user_role}';
        RETURN jsonb_set(event, '{claims,hierarchy_level}', to_jsonb(0));
    END IF;

    event := jsonb_set(event, '{claims,user_role}', to_jsonb(role_name));
    RETURN jsonb_set(event, '{claims,hierarchy_level}', to_jsonb(role_level));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_bootstrap_super_admin() FROM authenticated, anon, PUBLIC;
