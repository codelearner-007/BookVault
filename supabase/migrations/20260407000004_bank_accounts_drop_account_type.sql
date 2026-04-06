-- ==============================================
-- Drop account_type column from bank_accounts
-- Description: account_type is not required by the application;
--              users only provide a name, opening balance, and description.
-- Date: 2026-04-07
--
-- Rollback:
--   ALTER TABLE public.bank_accounts
--     ADD COLUMN account_type TEXT NOT NULL DEFAULT 'bank'
--     CHECK (account_type IN ('bank', 'cash'));
-- ==============================================

ALTER TABLE public.bank_accounts
  DROP COLUMN IF EXISTS account_type;
