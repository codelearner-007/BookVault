-- ==============================================
-- Migration: Business members, per-area rights and the access helper (B0.3)
-- Date: 2026-11-08
--
-- Why (user decisions D-30, D-32, D-39):
--   * business_members: a user's membership in a business, access_mode
--     'full' (every right on every feature area, incl. future ones; never the
--     owner-only areas) or 'custom' (exactly the rows below).
--   * business_member_area_access: one row per right a custom member holds on an
--     area, in any combination. All-key junction, so no surrogate id. Rows are
--     only inserted or deleted, never updated.
--       - refused: owner-only areas, platform areas, a non-view right on a
--         view-only area;
--       - implied view: inserting create/edit/delete adds view; deleting view
--         removes the member's other rights on that area.
--   * member_has_area_access(): the ONE access evaluation, used by the FastAPI
--     dependency now and by the RLS helper in B0.4. Exact and fail closed.
--   * No invitations table (D-30).
--
-- ROLLBACK (run manually):
--   DROP FUNCTION IF EXISTS public.member_has_area_access(uuid, uuid, text, text);
--   DROP TABLE IF EXISTS public.business_member_area_access;
--   DROP TABLE IF EXISTS public.business_members;
--   DROP TABLE IF EXISTS public.member_statuses;
--   DROP FUNCTION IF EXISTS public.add_implied_view_to_member(),
--                           public.remove_rights_without_view(),
--                           public.refuse_area_access_update();
-- ==============================================

CREATE TABLE public.member_statuses (
    id    UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key   TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL
);
INSERT INTO public.member_statuses (key, label) VALUES
    ('active', 'Active'),
    ('disabled', 'Disabled'),
    ('removed', 'Removed');

CREATE TABLE public.business_members (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_mode      TEXT NOT NULL CHECK (access_mode IN ('full', 'custom')),
    status_id        UUID NOT NULL REFERENCES public.member_statuses(id) ON DELETE RESTRICT,
    added_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    version          INTEGER NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT business_members_business_user_key UNIQUE (business_id, user_id),
    CONSTRAINT business_members_business_id_id_key UNIQUE (business_id, id)
);
CREATE INDEX idx_business_members_user_id ON public.business_members (user_id);
CREATE INDEX idx_business_members_business_status ON public.business_members (business_id, status_id);
CREATE INDEX idx_business_members_status_id ON public.business_members (status_id);
CREATE INDEX idx_business_members_added_by ON public.business_members (added_by_user_id)
    WHERE added_by_user_id IS NOT NULL;

CREATE TRIGGER business_members_updated_at
    BEFORE UPDATE ON public.business_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.business_member_area_access (
    business_id        UUID NOT NULL,
    business_member_id UUID NOT NULL,
    area_key           TEXT NOT NULL REFERENCES public.areas(key) ON DELETE CASCADE,
    right_key          TEXT NOT NULL REFERENCES public.area_rights(key) ON DELETE RESTRICT,
    PRIMARY KEY (business_member_id, area_key, right_key),
    CONSTRAINT business_member_area_access_member_fkey
        FOREIGN KEY (business_id, business_member_id)
        REFERENCES public.business_members (business_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_bmaa_business_member ON public.business_member_area_access (business_id, business_member_id);
CREATE INDEX idx_bmaa_area_key ON public.business_member_area_access (area_key);
CREATE INDEX idx_bmaa_right_key ON public.business_member_area_access (right_key);

CREATE OR REPLACE FUNCTION public.add_implied_view_to_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (SELECT implies_view FROM public.area_rights WHERE key = NEW.right_key) THEN
        INSERT INTO public.business_member_area_access
            (business_id, business_member_id, area_key, right_key)
        VALUES (NEW.business_id, NEW.business_member_id, NEW.area_key, 'view')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_rights_without_view()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.business_member_area_access
    WHERE business_member_id = OLD.business_member_id AND area_key = OLD.area_key;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refuse_area_access_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'business_member_area_access rows are inserted or deleted, never updated';
END;
$$;

CREATE TRIGGER bmaa_validate
    BEFORE INSERT ON public.business_member_area_access
    FOR EACH ROW EXECUTE FUNCTION public.validate_area_right_pair();
CREATE TRIGGER bmaa_implied_view
    AFTER INSERT ON public.business_member_area_access
    FOR EACH ROW EXECUTE FUNCTION public.add_implied_view_to_member();
CREATE TRIGGER bmaa_view_revoked
    AFTER DELETE ON public.business_member_area_access
    FOR EACH ROW WHEN (OLD.right_key = 'view')
    EXECUTE FUNCTION public.remove_rights_without_view();
CREATE TRIGGER bmaa_no_update
    BEFORE UPDATE ON public.business_member_area_access
    FOR EACH ROW EXECUTE FUNCTION public.refuse_area_access_update();

-- The single access evaluation (platform-model section 5.1, step 5). Exact, fail closed:
--   owner        -> every right on every business area (incl. owner-only, future areas);
--   full member  -> every right on every area that is not owner-only;
--   custom member-> the (area, right) row, and for a right with implies_view also the view row;
--   unknown right / unknown area / platform area / non-view right on a view-only area -> false.
CREATE OR REPLACE FUNCTION public.member_has_area_access(
    p_business_id UUID, p_user_id UUID, p_area_key TEXT, p_right_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH area AS (
        SELECT a.key, a.is_owner_only, a.is_view_only
        FROM public.areas a JOIN public.modules m ON m.id = a.module_id
        WHERE a.key = p_area_key AND m.key <> 'platform'
    ), right_row AS (
        SELECT r.key, r.implies_view FROM public.area_rights r WHERE r.key = p_right_key
    ), member AS (
        SELECT bm.id, bm.access_mode, (b.owner_id = p_user_id) AS is_owner
        FROM public.business_members bm
        JOIN public.businesses b ON b.id = bm.business_id
        JOIN public.member_statuses s ON s.id = bm.status_id
        WHERE bm.business_id = p_business_id AND bm.user_id = p_user_id AND s.key = 'active'
    )
    SELECT COALESCE((
        SELECT CASE
            WHEN area.is_view_only AND right_row.key <> 'view' THEN false
            WHEN member.is_owner THEN true
            WHEN area.is_owner_only THEN false
            WHEN member.access_mode = 'full' THEN true
            ELSE EXISTS (
                SELECT 1 FROM public.business_member_area_access x
                WHERE x.business_member_id = member.id AND x.area_key = area.key
                  AND x.right_key = right_row.key
            ) AND (NOT right_row.implies_view OR EXISTS (
                SELECT 1 FROM public.business_member_area_access v
                WHERE v.business_member_id = member.id AND v.area_key = area.key
                  AND v.right_key = 'view'
            ))
        END
        FROM area, right_row, member
    ), false);
$$;

ALTER TABLE public.member_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_member_area_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_statuses, public.business_members, public.business_member_area_access
    FROM anon, authenticated, PUBLIC;
REVOKE UPDATE ON public.business_member_area_access FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.member_has_area_access(uuid, uuid, text, text)
    FROM anon, authenticated, PUBLIC;
