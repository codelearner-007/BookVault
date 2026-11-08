-- ==============================================
-- Migration: drop the read-only legacy receipts table (B4 start; NA-03, D-06)
-- Date: 2026-11-08
--
-- The B3 receipt migration report (backend-ref/manager-io/b3-receipt-migration-report.md) is
-- signed off: every legacy receipt is a receipt document with the same id. Runbook B0.8: run
-- supabase/prechecks/20261108000033_drop_legacy_receipts.sql first (section A must be empty) and
-- take a pg_dump -Fc + sha256 (pre_b4_20261108000033_*.dump).
--
-- * Refuses to run while a legacy row has no receipt document with its id.
-- * Drops public.receipts (lines JSON, image_url, its trigger and policies go with it).
-- * Purge / export list without 'receipts'.
--
-- ROLLBACK: restore the table from the pre-B4 dump (pg_restore -t receipts) and the
--   business_scoped_tables() body of 20261108000031.
-- ==============================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.receipts r
        LEFT JOIN public.documents d ON d.business_id = r.business_id AND d.id = r.id
        LEFT JOIN public.document_types t ON t.id = d.document_type_id AND t.key = 'receipt'
        WHERE t.id IS NULL
    ) THEN
        RAISE EXCEPTION 'legacy receipts not migrated: run supabase/prechecks/20261108000033_drop_legacy_receipts.sql';
    END IF;
END
$$;

DROP TABLE public.receipts;

GRANT CREATE ON SCHEMA public TO bookvault_purge;
SET ROLE bookvault_purge;
CREATE OR REPLACE FUNCTION public.business_scoped_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY[
        'business_member_area_access', 'idempotency_keys', 'attachment_contents', 'attachments',
        'payment_allocations', 'journal_lines', 'journal_entries', 'opening_balances',
        'cash_transaction_lines', 'cash_transactions', 'inter_account_transfers', 'document_lines',
        'documents', 'document_sequences', 'business_currencies', 'capital_accounts',
        'bank_accounts', 'customers', 'suppliers', 'parties', 'coa_accounts', 'coa_groups',
        'business_tab_columns', 'business_tabs', 'business_format', 'business_details',
        'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;

COMMIT;
