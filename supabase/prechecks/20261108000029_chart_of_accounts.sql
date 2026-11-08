-- Pre-check for 20261108000029 (runbook B0.8 step 1): must return zero rows.
-- The COA backfill attaches every group to one of the 5 fixed roots and every account to a
-- group whose root matches its type; these are the rows it could not place safely.
WITH RECURSIVE tops(id, business_id, top_id, top_name, top_type, depth, path) AS (
    SELECT g.id, g.business_id, g.id, g.name, g.type, 0, ARRAY[g.id]
    FROM public.coa_groups g WHERE g.parent_group_id IS NULL
    UNION ALL
    SELECT c.id, c.business_id, t.top_id, t.top_name, t.top_type, t.depth + 1, t.path || c.id
    FROM public.coa_groups c
    JOIN tops t ON c.business_id = t.business_id AND c.parent_group_id = t.id
    WHERE NOT c.id = ANY (t.path) AND t.depth < 64
),
top_types AS (
    SELECT t.business_id, t.top_id, t.top_name, t.top_type, array_agg(DISTINCT a.type) AS types
    FROM tops t JOIN public.coa_accounts a ON a.business_id = t.business_id AND a.group_id = t.id
    GROUP BY 1, 2, 3, 4
)
-- 1. Groups in a parent cycle (never reachable from a top-level group).
SELECT 'group_cycle' AS problem, g.business_id, g.id AS row_id, g.name AS detail
FROM public.coa_groups g WHERE NOT EXISTS (SELECT 1 FROM tops t WHERE t.id = g.id)
UNION ALL
-- 2. A sub-group on another panel than its top-level group.
SELECT 'group_panel_mismatch', g.business_id, g.id, g.name
FROM public.coa_groups g JOIN tops t ON t.id = g.id WHERE g.type <> t.top_type
UNION ALL
-- 3. One top-level group holding accounts of several types (cannot pick one root).
SELECT 'mixed_account_types', business_id, top_id, top_name || ': ' || array_to_string(types, ',')
FROM top_types WHERE cardinality(types) > 1
UNION ALL
-- 4. A top-level group named like a fixed root holding accounts of another type.
SELECT 'root_type_mismatch', business_id, top_id, top_name || ': ' || array_to_string(types, ',')
FROM top_types tt
WHERE lower(top_name) IN ('assets', 'liabilities', 'equity', 'income', 'expenses')
  AND types <> ARRAY[CASE lower(top_name) WHEN 'assets' THEN 'asset' WHEN 'liabilities' THEN 'liability'
                     WHEN 'equity' THEN 'equity' WHEN 'income' THEN 'income' ELSE 'expense' END]
UNION ALL
-- 5. Account types on the wrong panel (asset/liability/equity belong on the balance sheet).
SELECT 'account_panel_mismatch', business_id, top_id, top_name || ': ' || array_to_string(types, ',')
FROM top_types
WHERE (top_type = 'pl') <> (types[1] IN ('income', 'expense')) AND cardinality(types) = 1
UNION ALL
-- 6. "Total" rows that carry lines (they are dropped; P&L totals are computed).
SELECT 'total_row_in_use', a.business_id, a.id, a.name
FROM public.coa_accounts a
WHERE a.type = 'total' AND (
    EXISTS (SELECT 1 FROM public.journal_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.document_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
    OR EXISTS (SELECT 1 FROM public.receipts r, jsonb_array_elements(r.lines) x
               WHERE r.business_id = a.business_id AND x->>'account_id' = a.id::text))
UNION ALL
-- 7. Cash-flow categories outside the new reference table.
SELECT 'cash_flow_category', business_id, id, cash_flow_category
FROM public.coa_accounts
WHERE cash_flow_category IS NOT NULL
  AND cash_flow_category NOT IN ('operating', 'investing', 'financing', 'cash_equivalent')
UNION ALL
-- 8. Template account codes already used by another account would only be skipped; duplicate
--    codes are impossible (UNIQUE since 20261108000016). Two system rows of one kind would be:
SELECT 'duplicate_system_row', business_id, NULL, name || ' x' || count(*)
FROM public.coa_accounts
WHERE is_system AND type <> 'total'
GROUP BY business_id, name HAVING count(*) > 1;
