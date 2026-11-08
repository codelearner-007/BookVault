-- ==============================================
-- Migration: business-user provisioning when GoTrue writes app_metadata after the insert
-- Date: 2026-11-08
--
-- GoTrue (admin createUser, v2.19x) inserts the auth.users row first and stores
-- app_metadata with a following UPDATE. handle_new_user (AFTER INSERT) therefore never
-- sees provisioned_for_business / created_by_user_id: the account became an `admin`,
-- POST /members answered 404 and the Next.js route deleted the account again.
--
-- This adds the same provisioning step on that first UPDATE, fail-closed and only for an
-- account that is still exactly what handle_new_user made of it moments ago:
--   * app_metadata gains provisioned_for_business (OLD had none; only the service key
--     can write app_metadata, as at insert),
--   * never signed in, created within PROVISION_WINDOW,
--   * profile not provisioned, no creator, role `admin`, owns no business, no membership,
--   * the creator owns the named business (the insert-time rule).
-- Anything else that adds the key later is refused (the UPDATE fails), so an existing
-- account can never be turned into a provisioned member.
-- The is_provisioned guard allows false -> true only inside this function
-- (transaction-local setting naming the user).
--
-- ROLLBACK (run manually):
--   DROP TRIGGER IF EXISTS on_auth_user_provisioned_late ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_user_provisioned_late();
--   then re-create protect_user_profile_provisioning() as in 20261108000003_platform_role_member.sql
-- ==============================================

CREATE OR REPLACE FUNCTION public.protect_user_profile_provisioning()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    provisioning_now BOOLEAN :=
        current_setting('bookvault.provisioning_user', true) = OLD.user_id::text;
BEGIN
    IF NEW.is_provisioned IS DISTINCT FROM OLD.is_provisioned
       AND NOT (provisioning_now AND OLD.is_provisioned = false AND NEW.is_provisioned = true) THEN
        RAISE EXCEPTION 'user_profiles.is_provisioned is immutable';
    END IF;
    IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       AND NEW.created_by_user_id IS NOT NULL
       AND NOT (provisioning_now AND OLD.created_by_user_id IS NULL) THEN
        RAISE EXCEPTION 'user_profiles.created_by_user_id can only be cleared';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_provisioned_late()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    provision_window CONSTANT INTERVAL := INTERVAL '5 minutes';
    provisioned_for UUID := NULLIF(NEW.raw_app_meta_data->>'provisioned_for_business', '')::UUID;
    created_by      UUID := NULLIF(NEW.raw_app_meta_data->>'created_by_user_id', '')::UUID;
BEGIN
    IF NEW.last_sign_in_at IS NOT NULL
       OR NEW.created_at < now() - provision_window
       OR created_by IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.user_profiles p
                      WHERE p.user_id = NEW.id AND NOT p.is_provisioned AND p.created_by_user_id IS NULL)
       OR NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
                      WHERE ur.user_id = NEW.id AND r.name = 'admin')
       OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.user_id = NEW.id)
       OR NOT EXISTS (SELECT 1 FROM public.businesses b
                      WHERE b.id = provisioned_for AND b.owner_id = created_by AND b.deleted_at IS NULL)
    THEN
        RAISE EXCEPTION 'provisioning can only be set on a new account by the owner of the business';
    END IF;

    PERFORM set_config('bookvault.provisioning_user', NEW.id::text, true);
    UPDATE public.user_profiles
    SET is_provisioned = true, created_by_user_id = created_by
    WHERE user_id = NEW.id;
    PERFORM set_config('bookvault.provisioning_user', '', true);

    UPDATE public.user_roles
    SET role_id = (SELECT id FROM public.roles WHERE name = 'member')
    WHERE user_id = NEW.id;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_user_provisioned_late() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_provisioned_late
    AFTER UPDATE OF raw_app_meta_data ON auth.users
    FOR EACH ROW
    WHEN (OLD.raw_app_meta_data->>'provisioned_for_business' IS NULL
          AND NEW.raw_app_meta_data->>'provisioned_for_business' IS NOT NULL)
    EXECUTE FUNCTION public.handle_user_provisioned_late();
