-- ==============================================
-- Migration: Bank Accounts
-- Description: Creates the bank_accounts table with RLS (service_role
--              full access only). Links each account to a business and
--              a COA account. RESTRICT on coa_account_id prevents
--              deleting a COA account that has bank accounts attached.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-07
--
-- Note: uuid_generate_v7()  loaded from 20260201000000_uuid_v7_function.sql
-- Note: handle_updated_at() loaded from 20260201000001_rbac_and_auth_system.sql
--
-- ROLLBACK (run manually if needed):
--   DROP TRIGGER IF EXISTS set_updated_at_bank_accounts ON public.bank_accounts;
--   DROP POLICY  IF EXISTS "bank_accounts_service_role_all" ON public.bank_accounts;
--   REVOKE ALL ON public.bank_accounts FROM service_role;
--   DROP TABLE  IF EXISTS public.bank_accounts;
-- ==============================================

-- ==============================================
-- STEP 1: CREATE TABLE
-- ==============================================

-- bank_accounts stores bank and cash accounts for a business.
-- Each account is linked to exactly one COA account (the ledger account
-- that records movements for this bank/cash account).
-- ON DELETE RESTRICT on coa_account_id: a COA account cannot be deleted
-- while bank accounts reference it, preserving ledger integrity.
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id              UUID           PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id     UUID           NOT NULL REFERENCES public.businesses(id)   ON DELETE CASCADE,
    coa_account_id  UUID           NOT NULL REFERENCES public.coa_accounts(id) ON DELETE RESTRICT,
    name            TEXT           NOT NULL,
    account_type    TEXT           NOT NULL CHECK (account_type IN ('bank', 'cash')),
    opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    description     TEXT,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ==============================================
-- STEP 2: INDEXES
-- ==============================================

-- business_id: primary filter for fetching all accounts in a business
CREATE INDEX IF NOT EXISTS idx_bank_accounts_business_id
    ON public.bank_accounts (business_id);

-- coa_account_id: used when checking references before COA account deletion
CREATE INDEX IF NOT EXISTS idx_bank_accounts_coa_account_id
    ON public.bank_accounts (coa_account_id);

-- composite (business_id, coa_account_id): supports SUM queries that
-- aggregate balances across accounts within a business filtered by COA
CREATE INDEX IF NOT EXISTS idx_bank_accounts_business_coa
    ON public.bank_accounts (business_id, coa_account_id);

-- ==============================================
-- STEP 3: UPDATED_AT TRIGGER
-- ==============================================

DROP TRIGGER IF EXISTS set_updated_at_bank_accounts ON public.bank_accounts;

CREATE TRIGGER set_updated_at_bank_accounts
    BEFORE UPDATE ON public.bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================
-- STEP 4: ENABLE ROW LEVEL SECURITY
-- ==============================================

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- STEP 5: RLS POLICY (service_role full access)
-- ==============================================
-- All database operations go through the FastAPI backend which uses the
-- service_role key. No direct authenticated/anon access is required.

DROP POLICY IF EXISTS "bank_accounts_service_role_all" ON public.bank_accounts;

CREATE POLICY "bank_accounts_service_role_all"
    ON public.bank_accounts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ==============================================
-- STEP 6: GRANTS (Principle of Least Privilege)
-- ==============================================

-- Service role (FastAPI backend) needs full CRUD
GRANT ALL ON public.bank_accounts TO service_role;

-- anon: NO access to application tables
-- authenticated: NO direct access (all reads/writes go through FastAPI)
