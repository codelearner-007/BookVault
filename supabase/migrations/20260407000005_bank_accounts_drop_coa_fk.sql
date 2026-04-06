-- ==============================================
-- Drop coa_account_id from bank_accounts
-- Description: Bank accounts are scoped to a business directly.
--              The COA account link is not needed — the total of all
--              bank accounts is displayed on the COA summary at query time.
-- Date: 2026-04-07
--
-- Rollback:
--   ALTER TABLE public.bank_accounts
--     ADD COLUMN coa_account_id UUID NOT NULL REFERENCES public.coa_accounts(id) ON DELETE RESTRICT;
--   CREATE INDEX idx_bank_accounts_coa_account_id ON public.bank_accounts (coa_account_id);
--   CREATE INDEX idx_bank_accounts_business_coa ON public.bank_accounts (business_id, coa_account_id);
-- ==============================================

DROP INDEX IF EXISTS idx_bank_accounts_coa_account_id;
DROP INDEX IF EXISTS idx_bank_accounts_business_coa;

ALTER TABLE public.bank_accounts
  DROP COLUMN IF EXISTS coa_account_id;
