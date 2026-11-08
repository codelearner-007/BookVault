-- ==============================================
-- Migration: Indexes and constraints (B0.5, CS-20, CS-24)
-- Date: 2026-11-08
--
--   * blank codes -> NULL, then UNIQUE (business_id, code) on customers, suppliers,
--     coa_accounts (NULL codes stay allowed);
--   * (business_id, email) indexes replace the global email indexes;
--   * CHECKs on coa_groups.type and coa_accounts.type.
--
-- Runbook (B0.8): data rewrite (blank codes) + new uniques -> run
-- supabase/prechecks/20261108000016_integrity_constraints.sql (zero rows; the DO
-- block below re-checks) and pg_dump -Fc before applying.
--
-- ROLLBACK (run manually):
--   ALTER TABLE public.customers DROP CONSTRAINT customers_business_code_key;
--   ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_business_code_key;
--   ALTER TABLE public.coa_accounts DROP CONSTRAINT coa_accounts_business_code_key;
--   ALTER TABLE public.coa_groups DROP CONSTRAINT coa_groups_type_values;
--   ALTER TABLE public.coa_accounts DROP CONSTRAINT coa_accounts_type_values;
--   DROP INDEX public.idx_customers_business_email, public.idx_suppliers_business_email;
--   CREATE INDEX idx_customers_email ON public.customers (email);
--   CREATE INDEX idx_suppliers_email ON public.suppliers (email);
--   (Blank codes are not restored: restore the dump if needed.)
-- ==============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.customers WHERE btrim(coalesce(code, '')) <> ''
        GROUP BY business_id, btrim(code) HAVING count(*) > 1
        UNION ALL
        SELECT 1 FROM public.suppliers WHERE btrim(coalesce(code, '')) <> ''
        GROUP BY business_id, btrim(code) HAVING count(*) > 1
        UNION ALL
        SELECT 1 FROM public.coa_accounts WHERE btrim(coalesce(code, '')) <> ''
        GROUP BY business_id, btrim(code) HAVING count(*) > 1
        UNION ALL
        SELECT 1 FROM public.coa_groups WHERE type NOT IN ('balance_sheet', 'pl')
        UNION ALL
        SELECT 1 FROM public.coa_accounts
        WHERE type NOT IN ('asset', 'liability', 'equity', 'income', 'expense', 'total')
    ) THEN
        RAISE EXCEPTION 'pre-check failed: duplicate codes or invalid COA types '
                        '(see supabase/prechecks/20261108000016_integrity_constraints.sql)';
    END IF;
END
$$;

UPDATE public.customers SET code = NULLIF(btrim(code), '')
WHERE code IS DISTINCT FROM NULLIF(btrim(code), '');
UPDATE public.suppliers SET code = NULLIF(btrim(code), '')
WHERE code IS DISTINCT FROM NULLIF(btrim(code), '');
UPDATE public.coa_accounts SET code = NULLIF(btrim(code), '')
WHERE code IS DISTINCT FROM NULLIF(btrim(code), '');

ALTER TABLE public.customers ADD CONSTRAINT customers_business_code_key UNIQUE (business_id, code);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_business_code_key UNIQUE (business_id, code);
ALTER TABLE public.coa_accounts ADD CONSTRAINT coa_accounts_business_code_key UNIQUE (business_id, code);

ALTER TABLE public.coa_groups
    ADD CONSTRAINT coa_groups_type_values CHECK (type IN ('balance_sheet', 'pl'));
ALTER TABLE public.coa_accounts
    ADD CONSTRAINT coa_accounts_type_values
        CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense', 'total'));

DROP INDEX IF EXISTS public.idx_customers_email;
DROP INDEX IF EXISTS public.idx_suppliers_email;
CREATE INDEX idx_customers_business_email ON public.customers (business_id, email);
CREATE INDEX idx_suppliers_business_email ON public.suppliers (business_id, email);
