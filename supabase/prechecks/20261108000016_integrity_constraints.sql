-- Pre-check for 20261108000016 (runbook B0.8 step 1): must return zero rows.
-- Duplicate codes per business (blank codes count as NULL and are ignored) and
-- COA type values outside the new CHECKs.
SELECT 'customers' AS tbl, business_id, btrim(code) AS code, count(*) AS n
FROM public.customers WHERE btrim(coalesce(code, '')) <> '' GROUP BY 1, 2, 3 HAVING count(*) > 1
UNION ALL
SELECT 'suppliers', business_id, btrim(code), count(*)
FROM public.suppliers WHERE btrim(coalesce(code, '')) <> '' GROUP BY 1, 2, 3 HAVING count(*) > 1
UNION ALL
SELECT 'coa_accounts', business_id, btrim(code), count(*)
FROM public.coa_accounts WHERE btrim(coalesce(code, '')) <> '' GROUP BY 1, 2, 3 HAVING count(*) > 1
UNION ALL
SELECT 'coa_groups.type', business_id, type, count(*)
FROM public.coa_groups WHERE type NOT IN ('balance_sheet', 'pl') GROUP BY 1, 2, 3
UNION ALL
SELECT 'coa_accounts.type', business_id, type, count(*)
FROM public.coa_accounts
WHERE type NOT IN ('asset', 'liability', 'equity', 'income', 'expense', 'total') GROUP BY 1, 2, 3;
