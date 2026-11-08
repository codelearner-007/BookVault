-- ==============================================
-- Migration: ledger reference data and book settings (B1)
-- Date: 2026-11-08
--
-- Reference tables of the stored general ledger (domain-model §3, §5.1):
--   * currencies (code + decimal_places; one platform default) and business_currencies
--     (one base currency per business, used for rounding);
--   * document_types, document_statuses, document_type_areas (allowed (type, area) pairs,
--     platform-model Appendix A), journal_entry_sources, rounding_modes;
--   * areas settings.lock_date and settings.numbering;
--     -- new area settings.lock_date: custom members have no rights until granted; owners/full members see it immediately
--     -- new area settings.numbering: custom members have no rights until granted; owners/full members see it immediately
--   * business_settings gains books_start_date, lock_date, rounding_mode_key
--     (existing businesses: books_start_date = earliest receipt date, else creation date);
--   * Journal Entries and Reports tabs on by default (build-plan B1, #10).
-- Each later phase inserts only its own document types / areas.
--
-- ROLLBACK (run manually):
--   UPDATE public.admin_tabs SET default_enabled = false WHERE key IN ('journal-entries', 'reports');
--   DROP TRIGGER businesses_create_base_currency ON public.businesses;
--   DROP FUNCTION public.create_business_base_currency();
--   ALTER TABLE public.business_settings DROP COLUMN rounding_mode_key, DROP COLUMN lock_date,
--     DROP COLUMN books_start_date;
--   DELETE FROM public.access_preset_rights WHERE area_key IN ('settings.lock_date', 'settings.numbering');
--   DELETE FROM public.areas WHERE key IN ('settings.lock_date', 'settings.numbering');
--   DROP TABLE public.rounding_modes, public.journal_entry_sources, public.document_type_areas,
--     public.document_statuses, public.document_types, public.business_currencies, public.currencies;
-- ==============================================

-- 1. Currencies
CREATE TABLE public.currencies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code                CHAR(3) NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{3}$'),
    name                TEXT NOT NULL,
    decimal_places      SMALLINT NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 4),
    is_platform_default BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX uq_currencies_platform_default ON public.currencies (is_platform_default)
    WHERE is_platform_default;

INSERT INTO public.currencies (code, name, decimal_places, is_platform_default) VALUES
    ('USD', 'US dollar', 2, true),
    ('EUR', 'Euro', 2, false),
    ('GBP', 'Pound sterling', 2, false),
    ('PKR', 'Pakistani rupee', 2, false),
    ('AED', 'UAE dirham', 2, false),
    ('SAR', 'Saudi riyal', 2, false),
    ('INR', 'Indian rupee', 2, false),
    ('CAD', 'Canadian dollar', 2, false),
    ('AUD', 'Australian dollar', 2, false),
    ('JPY', 'Japanese yen', 0, false),
    ('KWD', 'Kuwaiti dinar', 3, false);

CREATE TABLE public.business_currencies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    currency_id UUID NOT NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    is_base     BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT business_currencies_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT business_currencies_business_currency_key UNIQUE (business_id, currency_id)
);
CREATE UNIQUE INDEX uq_business_currencies_base ON public.business_currencies (business_id)
    WHERE is_base;
CREATE INDEX idx_business_currencies_currency_id ON public.business_currencies (currency_id);

INSERT INTO public.business_currencies (business_id, currency_id, is_base)
SELECT b.id, c.id, true
FROM public.businesses b CROSS JOIN public.currencies c
WHERE c.is_platform_default
ON CONFLICT (business_id, currency_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_business_base_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.business_currencies (business_id, currency_id, is_base)
    SELECT NEW.id, c.id, true FROM public.currencies c WHERE c.is_platform_default
    ON CONFLICT (business_id, currency_id) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_business_base_currency() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER businesses_create_base_currency
    AFTER INSERT ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.create_business_base_currency();

-- 2. Documents reference data
CREATE TABLE public.document_types (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key  TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.document_types (key, name) VALUES ('journal_entry', 'Journal entry');

CREATE TABLE public.document_statuses (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key  TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.document_statuses (key, name) VALUES
    ('draft', 'Draft'), ('posted', 'Posted'), ('void', 'Void'), ('template', 'Template');

CREATE TABLE public.document_type_areas (
    document_type_id UUID NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
    area_key         TEXT NOT NULL REFERENCES public.areas(key) ON DELETE RESTRICT,
    PRIMARY KEY (document_type_id, area_key)
);
CREATE INDEX idx_document_type_areas_area_key ON public.document_type_areas (area_key);
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT id, 'journal_entries' FROM public.document_types WHERE key = 'journal_entry';

CREATE TABLE public.journal_entry_sources (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key  TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.journal_entry_sources (key, name) VALUES
    ('document', 'Document'), ('reversal', 'Reversal'), ('cogs', 'Cost of goods sold'),
    ('revaluation', 'Revaluation'), ('opening', 'Opening balance'), ('disposal', 'Disposal');

CREATE TABLE public.rounding_modes (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    name TEXT NOT NULL
);
-- Half away from zero (OBSERVED T82; Python Decimal ROUND_HALF_UP).
INSERT INTO public.rounding_modes (key, name) VALUES ('half_away_from_zero', 'Half away from zero');

-- 3. Areas of this phase
INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT v.key, v.label, m.id, NULL, false, false, v.sort_order
FROM (VALUES
    ('settings.lock_date', 'Lock date and books start date', 123),
    ('settings.numbering', 'Numbering', 124)
) AS v(key, label, sort_order)
JOIN public.modules m ON m.key = 'settings'
ON CONFLICT (key) DO NOTHING;

-- Accountant preset includes the lock date (areas_seed named it before it existed).
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, 'settings.lock_date', r.key
FROM public.access_presets p CROSS JOIN public.area_rights r
WHERE p.key = 'accountant'
ON CONFLICT DO NOTHING;

-- 4. Book settings
ALTER TABLE public.business_settings
    ADD COLUMN books_start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN lock_date         DATE NULL,
    ADD COLUMN rounding_mode_key TEXT NOT NULL DEFAULT 'half_away_from_zero'
        REFERENCES public.rounding_modes(key) ON DELETE RESTRICT;
CREATE INDEX idx_business_settings_rounding_mode_key ON public.business_settings (rounding_mode_key);

COMMENT ON COLUMN public.business_settings.books_start_date IS
    'First day of the books; opening entries are dated the day before (domain-model §3.5).';
COMMENT ON COLUMN public.business_settings.lock_date IS
    'Inclusive: nothing dated on or before it may be posted or changed (PR-75). NULL = no lock.';

-- Existing businesses: earliest receipt date, else the creation date (M3).
UPDATE public.business_settings s
SET books_start_date = COALESCE(
    (SELECT min(r.date) FROM public.receipts r WHERE r.business_id = s.business_id),
    (SELECT b.created_at::date FROM public.businesses b WHERE b.id = s.business_id),
    s.books_start_date
);

-- 5. Journal Entries and Reports tabs on by default
UPDATE public.admin_tabs SET default_enabled = true WHERE key IN ('journal-entries', 'reports');
