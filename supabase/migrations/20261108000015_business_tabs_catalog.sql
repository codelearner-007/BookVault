-- ==============================================
-- Migration: Business shell keys (B0.5, NA-13, CS-23, CS-28)
-- Date: 2026-11-08
--
--   * admin_tabs gains parent_id (a child tab needs its parent enabled) and
--     default_enabled (replaces DEFAULT_ENABLED_TABS in business_service.py).
--   * business_tabs.label is dropped (it duplicated admin_tabs.label); business_tabs.key
--     becomes an FK to admin_tabs.key, so unknown keys are impossible (CS-23).
--   * Tab key receipt -> receipts (admin_tabs, cascaded to business_tabs;
--     areas.tab_key; business_tab_columns.tab_key). Old ?tab=receipt URLs are
--     redirected by the frontend shell.
--
-- Runbook (B0.8): destructive (DROP COLUMN, key rewrite) -> run
-- supabase/prechecks/20261108000015_business_tabs_catalog.sql (zero rows; the DO
-- block below re-checks) and pg_dump -Fc before applying.
--
-- ROLLBACK (run manually; data: restore the pre-migration dump):
--   UPDATE public.admin_tabs SET key = 'receipt', label = 'Receipt' WHERE key = 'receipts';
--   UPDATE public.areas SET tab_key = 'receipt' WHERE tab_key = 'receipts';
--   UPDATE public.business_tab_columns SET tab_key = 'receipt' WHERE tab_key = 'receipts';
--   ALTER TABLE public.business_tabs DROP CONSTRAINT business_tabs_key_fkey;
--   DROP INDEX public.idx_business_tabs_key;
--   ALTER TABLE public.business_tabs ADD COLUMN label TEXT;
--   UPDATE public.business_tabs bt SET label = t.label FROM public.admin_tabs t WHERE t.key = bt.key;
--   ALTER TABLE public.business_tabs ALTER COLUMN label SET NOT NULL;
--   ALTER TABLE public.admin_tabs DROP COLUMN parent_id, DROP COLUMN default_enabled;
-- ==============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.business_tabs bt
               LEFT JOIN public.admin_tabs t ON t.key = bt.key WHERE t.id IS NULL) THEN
        RAISE EXCEPTION 'pre-check failed: business_tabs keys missing from admin_tabs '
                        '(see supabase/prechecks/20261108000015_business_tabs_catalog.sql)';
    END IF;
END
$$;

ALTER TABLE public.admin_tabs
    ADD COLUMN parent_id UUID NULL REFERENCES public.admin_tabs(id) ON DELETE RESTRICT,
    ADD COLUMN default_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT admin_tabs_not_own_parent CHECK (parent_id IS DISTINCT FROM id);
CREATE INDEX idx_admin_tabs_parent_id ON public.admin_tabs (parent_id);
UPDATE public.admin_tabs SET default_enabled = true WHERE key IN ('summary', 'settings');

ALTER TABLE public.business_tabs DROP COLUMN label;
ALTER TABLE public.business_tabs
    ADD CONSTRAINT business_tabs_key_fkey FOREIGN KEY (key)
        REFERENCES public.admin_tabs(key) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX idx_business_tabs_key ON public.business_tabs (key);

UPDATE public.admin_tabs SET key = 'receipts', label = 'Receipts' WHERE key = 'receipt';
UPDATE public.areas SET tab_key = 'receipts' WHERE tab_key = 'receipt';
UPDATE public.business_tab_columns SET tab_key = 'receipts' WHERE tab_key = 'receipt';
