-- ==============================================
-- Business System Migration
-- Description: Creates businesses, business_details, business_format,
--              business_tabs, admin_tabs, coa_groups, and coa_accounts
--              tables with RLS (service_role full access only).
-- Author: DB Migration Manager Agent
-- Date: 2026-04-05
--
-- Note: uuid_generate_v7() loaded from 20260201000000_uuid_v7_function.sql
-- Note: handle_updated_at() loaded from 20260201000001_rbac_and_auth_system.sql
-- ==============================================

-- ==============================================
-- STEP 1: CREATE TABLES
-- ==============================================

-- ---- 1a. businesses -------------------------
-- Core business entity. owner_id references the Supabase auth user.
CREATE TABLE IF NOT EXISTS public.businesses (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    name       TEXT        NOT NULL,
    country    TEXT,
    owner_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 1b. business_details -------------------
-- 1:1 extended profile for a business (display/contact info).
CREATE TABLE IF NOT EXISTS public.business_details (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID        NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    name        TEXT,
    address     TEXT,
    country     TEXT,
    image_url   TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 1c. business_format --------------------
-- 1:1 locale/formatting preferences for a business.
CREATE TABLE IF NOT EXISTS public.business_format (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id       UUID        NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
    date_format       TEXT,
    time_format       TEXT,
    first_day_of_week TEXT,
    number_format     TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 1d. business_tabs ----------------------
-- Per-business navigation tabs. key is a machine-readable slug (e.g. 'journal-entries').
CREATE TABLE IF NOT EXISTS public.business_tabs (
    id          UUID    PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID    NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    key         TEXT    NOT NULL,
    label       TEXT    NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    order_index INTEGER NOT NULL DEFAULT 0,
    UNIQUE (business_id, key)
);

-- ---- 1e. admin_tabs -------------------------
-- Global admin navigation tabs (not scoped to any business).
CREATE TABLE IF NOT EXISTS public.admin_tabs (
    id          UUID    PRIMARY KEY DEFAULT uuid_generate_v7(),
    key         TEXT    NOT NULL UNIQUE,
    label       TEXT    NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    order_index INTEGER NOT NULL DEFAULT 0
);

-- ---- 1f. coa_groups -------------------------
-- Chart of accounts groups. Self-referential: a group can have a parent group.
-- type is either 'balance_sheet' or 'pl' (profit & loss).
CREATE TABLE IF NOT EXISTS public.coa_groups (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    type            TEXT        NOT NULL,
    parent_group_id UUID        REFERENCES public.coa_groups(id) ON DELETE SET NULL,
    is_fixed        BOOLEAN     NOT NULL DEFAULT FALSE,
    is_orphaned     BOOLEAN     NOT NULL DEFAULT FALSE,
    order_index     INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 1g. coa_accounts -----------------------
-- Chart of accounts (individual ledger accounts).
-- group_id references a coa_groups row; nullable so accounts can be ungrouped.
CREATE TABLE IF NOT EXISTS public.coa_accounts (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id         UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name                TEXT        NOT NULL,
    code                TEXT,
    group_id            UUID        REFERENCES public.coa_groups(id) ON DELETE SET NULL,
    cash_flow_category  TEXT,
    order_index         INTEGER     NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================
-- STEP 2: INDEXES
-- ==============================================

-- businesses: owner_id is the primary filter for listing a user's businesses
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id
    ON public.businesses (owner_id);

-- business_tabs: fetched by business_id for tab rendering
CREATE INDEX IF NOT EXISTS idx_business_tabs_business_id
    ON public.business_tabs (business_id);

-- coa_groups: fetched by business_id for the full COA tree
CREATE INDEX IF NOT EXISTS idx_coa_groups_business_id
    ON public.coa_groups (business_id);

-- coa_accounts: fetched by business_id for the full account list
CREATE INDEX IF NOT EXISTS idx_coa_accounts_business_id
    ON public.coa_accounts (business_id);

-- ==============================================
-- STEP 3: UPDATED_AT TRIGGERS
-- ==============================================

DROP TRIGGER IF EXISTS set_updated_at_businesses      ON public.businesses;
DROP TRIGGER IF EXISTS set_updated_at_business_details ON public.business_details;
DROP TRIGGER IF EXISTS set_updated_at_business_format  ON public.business_format;
DROP TRIGGER IF EXISTS set_updated_at_coa_groups       ON public.coa_groups;
DROP TRIGGER IF EXISTS set_updated_at_coa_accounts     ON public.coa_accounts;

CREATE TRIGGER set_updated_at_businesses
    BEFORE UPDATE ON public.businesses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_business_details
    BEFORE UPDATE ON public.business_details
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_business_format
    BEFORE UPDATE ON public.business_format
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_coa_groups
    BEFORE UPDATE ON public.coa_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_coa_accounts
    BEFORE UPDATE ON public.coa_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- STEP 4: SEED admin_tabs DEFAULTS
-- ==============================================

-- Insert default global admin tabs. ON CONFLICT DO NOTHING is idempotent so
-- re-running the migration or resetting the DB will not duplicate rows.
INSERT INTO public.admin_tabs (key, label, enabled, order_index)
VALUES
    ('summary',          'Summary',          TRUE, 0),
    ('journal-entries',  'Journal Entries',  TRUE, 1),
    ('reports',          'Reports',          TRUE, 2),
    ('settings',         'Settings',         TRUE, 3)
ON CONFLICT (key) DO NOTHING;

-- ==============================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.businesses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_format  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_tabs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tabs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coa_accounts     ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- STEP 6: RLS POLICIES (service_role full access)
-- ==============================================
-- All database operations go through the FastAPI backend which uses the
-- service_role key. No direct authenticated/anon access is required.

DROP POLICY IF EXISTS "businesses_service_role_all"        ON public.businesses;
DROP POLICY IF EXISTS "business_details_service_role_all"  ON public.business_details;
DROP POLICY IF EXISTS "business_format_service_role_all"   ON public.business_format;
DROP POLICY IF EXISTS "business_tabs_service_role_all"     ON public.business_tabs;
DROP POLICY IF EXISTS "admin_tabs_service_role_all"        ON public.admin_tabs;
DROP POLICY IF EXISTS "coa_groups_service_role_all"        ON public.coa_groups;
DROP POLICY IF EXISTS "coa_accounts_service_role_all"      ON public.coa_accounts;

-- businesses
CREATE POLICY "businesses_service_role_all"
    ON public.businesses FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- business_details
CREATE POLICY "business_details_service_role_all"
    ON public.business_details FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- business_format
CREATE POLICY "business_format_service_role_all"
    ON public.business_format FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- business_tabs
CREATE POLICY "business_tabs_service_role_all"
    ON public.business_tabs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- admin_tabs
CREATE POLICY "admin_tabs_service_role_all"
    ON public.admin_tabs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- coa_groups
CREATE POLICY "coa_groups_service_role_all"
    ON public.coa_groups FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- coa_accounts
CREATE POLICY "coa_accounts_service_role_all"
    ON public.coa_accounts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================
-- STEP 7: GRANTS (Principle of Least Privilege)
-- ==============================================

-- Service role (FastAPI backend) needs full CRUD on all new tables
GRANT ALL ON public.businesses       TO service_role;
GRANT ALL ON public.business_details TO service_role;
GRANT ALL ON public.business_format  TO service_role;
GRANT ALL ON public.business_tabs    TO service_role;
GRANT ALL ON public.admin_tabs       TO service_role;
GRANT ALL ON public.coa_groups       TO service_role;
GRANT ALL ON public.coa_accounts     TO service_role;

-- anon: NO access to application tables
-- authenticated: NO direct access (all reads/writes go through FastAPI)

-- ==============================================
-- ROLLBACK (run manually if needed)
-- ==============================================
-- DROP TRIGGER IF EXISTS set_updated_at_coa_accounts   ON public.coa_accounts;
-- DROP TRIGGER IF EXISTS set_updated_at_coa_groups     ON public.coa_groups;
-- DROP TRIGGER IF EXISTS set_updated_at_business_format ON public.business_format;
-- DROP TRIGGER IF EXISTS set_updated_at_business_details ON public.business_details;
-- DROP TRIGGER IF EXISTS set_updated_at_businesses     ON public.businesses;
-- DROP TABLE IF EXISTS public.coa_accounts;
-- DROP TABLE IF EXISTS public.coa_groups;
-- DROP TABLE IF EXISTS public.admin_tabs;
-- DROP TABLE IF EXISTS public.business_tabs;
-- DROP TABLE IF EXISTS public.business_format;
-- DROP TABLE IF EXISTS public.business_details;
-- DROP TABLE IF EXISTS public.businesses;
