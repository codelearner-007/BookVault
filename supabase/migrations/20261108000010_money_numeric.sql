-- ==============================================
-- Migration: Ledger-safe money columns (B0.5, CS-09, AC-22)
-- Date: 2026-11-08
--
-- Why: money is stored as numeric(19,4) everywhere (domain-model §1). The bank
-- account balances were numeric(15,2). Widening keeps every existing value.
-- Receipt line amounts live in receipts.lines (jsonb) until B3; the API now writes
-- them as decimal strings computed server-side.
--
-- Runbook (B0.8): type change -> pg_dump -Fc before applying.
--
-- ROLLBACK (run manually):
--   ALTER TABLE public.bank_accounts
--     ALTER COLUMN opening_balance TYPE numeric(15,2),
--     ALTER COLUMN current_balance TYPE numeric(15,2);
-- ==============================================

ALTER TABLE public.bank_accounts
    ALTER COLUMN opening_balance TYPE numeric(19,4),
    ALTER COLUMN current_balance TYPE numeric(19,4);
