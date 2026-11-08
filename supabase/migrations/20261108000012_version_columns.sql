-- ==============================================
-- Migration: Optimistic-locking version columns (B0.5, CS-11, AC-20)
-- Date: 2026-11-08
--
-- Every mutable business record carries `version`; the API updates and deletes
-- with `WHERE version = :v` and answers 409 when the row moved on.
-- (business_members already has one since B0.3.)
--
-- ROLLBACK (run manually):
--   ALTER TABLE public.<table> DROP COLUMN version;  -- for each table below
-- ==============================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'businesses', 'bank_accounts', 'customers', 'suppliers', 'receipts',
        'coa_groups', 'coa_accounts'
    ] LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN version INTEGER NOT NULL DEFAULT 1'
            ' CONSTRAINT %I CHECK (version >= 1)', t, t || '_version_positive');
    END LOOP;
END
$$;
