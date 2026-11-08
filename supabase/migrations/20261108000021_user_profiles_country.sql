-- ==============================================
-- Migration: User country (B0.7, M11, D-28)
-- Date: 2026-11-08
--
-- Signup asks for the user's country (prefilled from the browser locale); it is
-- used to preselect the country of a new business (B2) and stays editable in
-- the profile. Users from before B0.7 keep NULL and are asked once at their next
-- sign-in; skipping sets country_prompt_dismissed_at.
--
-- handle_new_user stores raw_user_meta_data.country_id only when it names an
-- existing country (user metadata is client-supplied); anything else -> NULL.
--
-- ROLLBACK (run manually):
--   Restore handle_new_user from 20261108000003_platform_role_member.sql, then
--   ALTER TABLE public.user_profiles DROP COLUMN country_prompt_dismissed_at,
--                                    DROP COLUMN country_id;
-- ==============================================

ALTER TABLE public.user_profiles
    ADD COLUMN country_id UUID NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
    ADD COLUMN country_prompt_dismissed_at TIMESTAMPTZ NULL;

CREATE INDEX idx_user_profiles_country_id
    ON public.user_profiles (country_id) WHERE country_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    provisioned_for UUID := NULLIF(NEW.raw_app_meta_data->>'provisioned_for_business', '')::UUID;
    created_by      UUID := NULLIF(NEW.raw_app_meta_data->>'created_by_user_id', '')::UUID;
    requested_country TEXT := NEW.raw_user_meta_data->>'country_id';
    country         UUID;
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

    IF requested_country ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT c.id INTO country FROM public.countries c WHERE c.id = requested_country::uuid;
    END IF;

    INSERT INTO public.user_profiles (user_id, full_name, is_provisioned, created_by_user_id, country_id)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', provisioned_for IS NOT NULL, created_by, country);

    -- 2. Every self-signup is admin at insert (the bootstrap role comes after confirmation).
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT NEW.id, r.id FROM public.roles r WHERE r.name = role_key;

    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, PUBLIC;
