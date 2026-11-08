-- Pre-check / dry run for 20261108000032 (runbook B0.8 step 1; NA-03, D-06, L5).
-- Read-only. Section A must return zero rows (the migration refuses to run otherwise).
-- Section B is the dry-run plan: one row per receipt with its outcome (post | draft + reason),
-- the stored and recomputed totals. Section C: per bank account, the stored balance and the
-- balance the ledger will show (posted receipts + opening balance) plus draft totals.

-- A. Blocking problems
WITH dup AS (
    SELECT business_id, reference, count(*) AS n FROM public.receipts
    WHERE reference IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1
)
SELECT 'duplicate_reference' AS problem, business_id, reference AS detail FROM dup
UNION ALL
SELECT 'receipt_in_locked_period', r.business_id, r.id::text || ' ' || r.date
FROM public.receipts r JOIN public.business_settings s ON s.business_id = r.business_id
WHERE s.lock_date IS NOT NULL AND r.date <= s.lock_date
UNION ALL
SELECT 'bank_opening_in_locked_period', b.business_id, b.id::text
FROM public.bank_accounts b JOIN public.business_settings s ON s.business_id = b.business_id
WHERE b.opening_balance <> 0 AND s.lock_date IS NOT NULL AND s.books_start_date - 1 <= s.lock_date;

-- B. Dry-run plan per receipt
WITH lines AS (
    SELECT r.id AS receipt_id, r.business_id, x.ord, x.line ->> 'account_id' AS account_ref,
           round((x.line ->> 'amount')::numeric * COALESCE((x.line ->> 'qty')::numeric, 1)
                 - COALESCE((x.line ->> 'discount')::numeric, 0), 2) AS total,
           (x.line ->> 'total')::numeric AS stored_total
    FROM public.receipts r, jsonb_array_elements(r.lines) WITH ORDINALITY AS x(line, ord)
),
resolved AS (
    SELECT l.*, CASE WHEN l.account_ref = 'suspense' THEN sa.id ELSE a.id END AS account_id,
           COALESCE(st.subledger_kind, 'none') AS subledger_kind
    FROM lines l
    LEFT JOIN public.coa_accounts a ON a.business_id = l.business_id
         -- CASE, not AND: the cast must never see a non-uuid string ('suspense')
         AND a.id = CASE WHEN l.account_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                          THEN (l.account_ref)::uuid END
    LEFT JOIN public.system_account_types st ON st.id = a.system_account_type_id
    LEFT JOIN public.coa_accounts sa ON sa.business_id = l.business_id AND l.account_ref = 'suspense'
         AND sa.system_account_type_id = (SELECT id FROM public.system_account_types WHERE code = 'suspense')
),
per_receipt AS (
    SELECT r.id, r.business_id, r.date, r.reference,
           COALESCE(sum(x.total), 0) AS total, COALESCE(sum(x.stored_total), 0) AS stored_total,
           count(x.ord) AS line_count,
           bool_or(x.account_id IS NULL) AS account_missing,
           bool_or(x.subledger_kind <> 'none') AS account_needs_subledger,
           NOT EXISTS (SELECT 1 FROM public.bank_accounts b
                       WHERE b.business_id = r.business_id AND b.id = r.received_in_account_id) AS bank_missing,
           (r.paid_by_type = 'Contact' AND r.paid_by_contact_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.customers c WHERE r.paid_by_contact_type = 'customer'
                  AND c.business_id = r.business_id AND c.id = r.paid_by_contact_id
                UNION ALL
                SELECT 1 FROM public.suppliers s WHERE r.paid_by_contact_type = 'supplier'
                  AND s.business_id = r.business_id AND s.id = r.paid_by_contact_id)) AS contact_missing
    FROM public.receipts r LEFT JOIN resolved x ON x.receipt_id = r.id
    GROUP BY r.id
)
SELECT id AS receipt_id, business_id, date, reference, total, stored_total,
       CASE WHEN bank_missing OR contact_missing OR account_missing OR account_needs_subledger
                 OR line_count = 0 OR total <= 0 THEN 'draft' ELSE 'post' END AS outcome,
       concat_ws(', ',
           CASE WHEN bank_missing THEN 'bank account missing' END,
           CASE WHEN contact_missing THEN 'contact missing' END,
           CASE WHEN account_missing THEN 'line account missing' END,
           CASE WHEN account_needs_subledger THEN 'line account needs a sub-ledger' END,
           CASE WHEN line_count = 0 THEN 'no lines' END,
           CASE WHEN line_count > 0 AND total <= 0 THEN 'total not positive' END,
           CASE WHEN total <> stored_total THEN 'stored total differs from recomputed' END) AS notes
FROM per_receipt
ORDER BY business_id, date, id;

-- C. Bank accounts: stored balance vs ledger-to-be
SELECT b.id AS bank_account_id, b.business_id, b.name, b.opening_balance, b.current_balance,
       b.opening_balance + COALESCE((
           SELECT sum(round((x.line ->> 'amount')::numeric * COALESCE((x.line ->> 'qty')::numeric, 1)
                            - COALESCE((x.line ->> 'discount')::numeric, 0), 2))
           FROM public.receipts r, jsonb_array_elements(r.lines) AS x(line)
           WHERE r.business_id = b.business_id AND r.received_in_account_id = b.id), 0) AS recomputed_balance
FROM public.bank_accounts b
ORDER BY b.business_id, b.name;
