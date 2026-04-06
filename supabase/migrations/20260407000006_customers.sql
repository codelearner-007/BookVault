-- ==============================================
-- Migration: Customers
-- Description: Creates the customers table with RLS (service_role
--              full access only). Scoped to a business via business_id FK.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-07
--
-- Note: uuid_generate_v7()  loaded from 20260201000000_uuid_v7_function.sql
-- Note: handle_updated_at() loaded from 20260201000001_rbac_and_auth_system.sql
--
-- ROLLBACK (run manually if needed):
--   DROP TRIGGER IF EXISTS set_updated_at_customers ON public.customers;
--   DROP POLICY  IF EXISTS "customers_service_role_all" ON public.customers;
--   REVOKE ALL ON public.customers FROM service_role;
--   DROP TABLE  IF EXISTS public.customers;
-- ==============================================

-- ==============================================
-- STEP 1: CREATE TABLE
-- ==============================================

-- customers stores customer records scoped to a business.
-- ON DELETE CASCADE on business_id: removing a business removes all its customers.
CREATE TABLE IF NOT EXISTS public.customers (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id       UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    code              TEXT,
    billing_address   TEXT,
    delivery_address  TEXT,
    email             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================
-- STEP 2: INDEXES
-- ==============================================

-- business_id: primary filter for fetching all customers in a business
CREATE INDEX IF NOT EXISTS idx_customers_business_id
    ON public.customers (business_id);

-- email: supports lookup and search by customer email within a business
CREATE INDEX IF NOT EXISTS idx_customers_email
    ON public.customers (email);

-- ==============================================
-- STEP 3: UPDATED_AT TRIGGER
-- ==============================================

DROP TRIGGER IF EXISTS set_updated_at_customers ON public.customers;

CREATE TRIGGER set_updated_at_customers
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- STEP 5: RLS POLICY (service_role full access)
-- ==============================================
-- All database operations go through the FastAPI backend which uses the
-- service_role key. No direct authenticated/anon access is required.

DROP POLICY IF EXISTS "customers_service_role_all" ON public.customers;

CREATE POLICY "customers_service_role_all"
    ON public.customers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================
-- STEP 6: GRANTS (Principle of Least Privilege)
-- ==============================================

-- Service role (FastAPI backend) needs full CRUD
GRANT ALL ON public.customers TO service_role;

-- anon: NO access to application tables
-- authenticated: NO direct access (all reads/writes go through FastAPI)
