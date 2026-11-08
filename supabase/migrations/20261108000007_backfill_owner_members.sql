-- ==============================================
-- Migration: Owner membership rows (B0.3)
-- Date: 2026-11-08
--
-- Why: ownership is a fact of businesses.owner_id. The owner also gets one
-- business_members row (access_mode 'full', always 'active') so membership has
-- a single source for the access check and for RLS (B0.4).
--   * backfill: one row for each existing business (deleted ones included);
--   * businesses insert / owner change: the owner's row is created or reset
--     to full + active (a previous owner keeps a full membership until the new
--     owner removes it);
--   * the owner's row cannot be suspended, removed, set to custom or moved to
--     another user; it disappears only with its business (cascade).
--
-- ROLLBACK (run manually):
--   DROP TRIGGER IF EXISTS businesses_owner_member_sync ON public.businesses;
--   DROP TRIGGER IF EXISTS business_members_protect_owner ON public.business_members;
--   DROP FUNCTION IF EXISTS public.sync_owner_member(), public.protect_owner_member();
--   DELETE FROM public.business_members bm USING public.businesses b
--   WHERE bm.business_id = b.id AND bm.user_id = b.owner_id;
-- ==============================================

INSERT INTO public.business_members (business_id, user_id, access_mode, status_id, added_by_user_id)
SELECT b.id, b.owner_id, 'full', s.id, b.owner_id
FROM public.businesses b
CROSS JOIN public.member_statuses s
WHERE s.key = 'active'
ON CONFLICT (business_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    active_id UUID := (SELECT id FROM public.member_statuses WHERE key = 'active');
BEGIN
    INSERT INTO public.business_members (business_id, user_id, access_mode, status_id, added_by_user_id)
    VALUES (NEW.id, NEW.owner_id, 'full', active_id, NEW.owner_id)
    ON CONFLICT (business_id, user_id)
    DO UPDATE SET access_mode = 'full', status_id = active_id;
    -- A full member keeps no custom rows.
    DELETE FROM public.business_member_area_access x
    USING public.business_members bm
    WHERE x.business_member_id = bm.id AND bm.business_id = NEW.id AND bm.user_id = NEW.owner_id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER businesses_owner_member_sync
    AFTER INSERT OR UPDATE OF owner_id ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.sync_owner_member();

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

CREATE TRIGGER business_members_protect_owner
    BEFORE UPDATE OR DELETE ON public.business_members
    FOR EACH ROW EXECUTE FUNCTION public.protect_owner_member();

REVOKE EXECUTE ON FUNCTION public.sync_owner_member() FROM anon, authenticated, PUBLIC;
