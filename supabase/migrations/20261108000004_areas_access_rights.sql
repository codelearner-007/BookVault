-- ==============================================
-- Migration: Areas, independent access rights and access presets (B0.3)
-- Date: 2026-11-08
--
-- Why (user decision D-39, replaces the cumulative levels of D-33):
--   A business user holds independent rights per area: view, create, edit,
--   delete, in any combination. create/edit/delete imply view (implies_view
--   drives that rule, so no right key is hardcoded in it). There is no
--   access_levels table and no rank.
--
--   modules  : grouping of areas (plan gating DEFERRED).
--   areas    : one permission area per tab / settings page / report group.
--              is_owner_only: never grantable, not covered by Full access.
--              is_view_only : only view is meaningful (summary, reports, history, export).
--              Areas of module `platform` are super admin only and never business areas.
--              tab_key is the admin_tabs.key the area opens (plain text, because
--              some tab rows are seeded outside supabase/migrations).
--   area_rights: the four right keys (seeded here).
--   access_presets / access_preset_rights: UI templates (View only, Bookkeeper,
--              Accountant) that only tick boxes; nothing links a member to a preset.
--
-- Rows of areas and presets are seeded in 20261108000005_areas_seed.sql.
--
-- ROLLBACK (run manually):
--   DROP TABLE IF EXISTS public.access_preset_rights, public.access_presets,
--                        public.areas, public.area_rights, public.modules;
--   DROP FUNCTION IF EXISTS public.validate_area_right_pair();
--   DROP FUNCTION IF EXISTS public.add_implied_view_to_preset();
-- ==============================================

CREATE TABLE public.modules (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key        TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.areas (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key           TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.]*$'),
    label         TEXT NOT NULL,
    module_id     UUID NOT NULL REFERENCES public.modules(id) ON DELETE RESTRICT,
    tab_key       TEXT NULL,
    is_owner_only BOOLEAN NOT NULL DEFAULT false,
    is_view_only  BOOLEAN NOT NULL DEFAULT false,
    sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_areas_module_id ON public.areas (module_id);
CREATE INDEX idx_areas_tab_key ON public.areas (tab_key) WHERE tab_key IS NOT NULL;

CREATE TABLE public.area_rights (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key          TEXT NOT NULL UNIQUE,
    label        TEXT NOT NULL,
    implies_view BOOLEAN NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.area_rights (key, label, implies_view, sort_order) VALUES
    ('view',   'View',   false, 0),
    ('create', 'Create', true,  1),
    ('edit',   'Edit',   true,  2),
    ('delete', 'Delete', true,  3);

CREATE TABLE public.access_presets (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key        TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.access_preset_rights (
    preset_id UUID NOT NULL REFERENCES public.access_presets(id) ON DELETE CASCADE,
    area_key  TEXT NOT NULL REFERENCES public.areas(key) ON DELETE CASCADE,
    right_key TEXT NOT NULL REFERENCES public.area_rights(key) ON DELETE RESTRICT,
    PRIMARY KEY (preset_id, area_key, right_key)
);
CREATE INDEX idx_access_preset_rights_area_key ON public.access_preset_rights (area_key);
CREATE INDEX idx_access_preset_rights_right_key ON public.access_preset_rights (right_key);

-- Shared by access_preset_rights and business_member_area_access: only grantable
-- areas, and only view on a view-only area.
CREATE OR REPLACE FUNCTION public.validate_area_right_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.areas a JOIN public.modules m ON m.id = a.module_id
        WHERE a.key = NEW.area_key AND NOT a.is_owner_only AND m.key <> 'platform'
    ) THEN
        RAISE EXCEPTION 'area % cannot be granted', NEW.area_key USING ERRCODE = '23514';
    END IF;
    IF NEW.right_key <> 'view' AND EXISTS (
        SELECT 1 FROM public.areas WHERE key = NEW.area_key AND is_view_only
    ) THEN
        RAISE EXCEPTION 'area % is view-only', NEW.area_key USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_implied_view_to_preset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (SELECT implies_view FROM public.area_rights WHERE key = NEW.right_key) THEN
        INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
        VALUES (NEW.preset_id, NEW.area_key, 'view')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER access_preset_rights_validate
    BEFORE INSERT ON public.access_preset_rights
    FOR EACH ROW EXECUTE FUNCTION public.validate_area_right_pair();
CREATE TRIGGER access_preset_rights_implied_view
    AFTER INSERT ON public.access_preset_rights
    FOR EACH ROW EXECUTE FUNCTION public.add_implied_view_to_preset();

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_preset_rights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modules, public.areas, public.area_rights,
              public.access_presets, public.access_preset_rights
    FROM anon, authenticated, PUBLIC;
