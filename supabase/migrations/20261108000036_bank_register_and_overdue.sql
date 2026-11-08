-- ==============================================
-- Migration: bank account register, receipts/payments without a bank account, overdue invoices
-- Date: 2026-11-08
--
-- * cash_transactions.bank_account_id NULL is now valid on posted documents too: the bank side
--   then posts to the Suspense system account (posting-rules PR-78). No column change.
-- * public.bank_account_transactions gains a date range and becomes the account's register:
--   per document the net movement, the counterparty and the running balance (all movements up
--   to the row, so the balance is the ledger balance after it, whatever the range starts on).
-- * public.dashboard_business_figures gains overdue_count / overdue_amount: posted sales invoices
--   due before p_to with a balance due > 0 as at p_to (sales_invoices:view).
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.bank_account_transactions(uuid, uuid, date, date, integer, integer);
--   DROP FUNCTION public.dashboard_business_figures(uuid[], date, date);
--   recreate both from 20261108000031 (section "Aggregates") and 20261108000035;
--   COMMENT ON COLUMN public.cash_transactions.bank_account_id IS NULL;
-- ==============================================

COMMENT ON COLUMN public.cash_transactions.bank_account_id IS
    'NULL = no bank or cash account: the bank side posts to Suspense (PR-78)';

DROP FUNCTION IF EXISTS public.bank_account_transactions(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.bank_account_transactions(uuid, uuid, date, date, integer, integer);
GRANT SELECT ON public.customers, public.suppliers, public.capital_accounts TO bookvault_rls_owner;

-- 1. Register of one bank or cash account (B0.4: the caller's view right checked here)
CREATE FUNCTION public.bank_account_transactions(
    p_business_id uuid, p_bank_account_id uuid, p_from date, p_to date, p_offset integer, p_limit integer
)
RETURNS TABLE (document_id uuid, document_type text, document_date date, reference text,
               description text, counterparty text, amount numeric, balance numeric,
               is_pending boolean, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH moves AS (
        SELECT e.document_id, sum(l.debit - l.credit) AS net
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        WHERE l.business_id = p_business_id AND l.bank_account_id = p_bank_account_id
        GROUP BY e.document_id
        HAVING sum(l.debit - l.credit) <> 0
    ),
    register AS (
        SELECT d.id, d.document_date, d.reference, d.description, d.document_type_id, m.net,
               sum(m.net) OVER (ORDER BY d.document_date, d.id) AS balance
        FROM moves m
        JOIN public.documents d ON d.business_id = p_business_id AND d.id = m.document_id
        WHERE p_to IS NULL OR d.document_date <= p_to
    )
    SELECT r.id, t.key, r.document_date, r.reference, r.description,
           COALESCE(c.counterparty_name, cu.name, su.name, ca.name,
                    CASE WHEN x.from_bank_account_id = p_bank_account_id THEN tb.name ELSE fb.name END),
           r.net, r.balance,
           COALESCE((c.clears_later AND c.cleared_on IS NULL)
                    OR (x.from_bank_account_id = p_bank_account_id AND x.from_clears_later AND x.from_cleared_on IS NULL)
                    OR (x.to_bank_account_id = p_bank_account_id AND x.to_clears_later AND x.to_cleared_on IS NULL),
                    false),
           count(*) OVER ()
    FROM register r
    JOIN public.document_types t ON t.id = r.document_type_id
    LEFT JOIN public.cash_transactions c ON c.business_id = p_business_id AND c.document_id = r.id
    LEFT JOIN public.customers cu ON cu.business_id = p_business_id AND cu.id = c.counterparty_party_id
    LEFT JOIN public.suppliers su ON su.business_id = p_business_id AND su.id = c.counterparty_party_id
    LEFT JOIN public.capital_accounts ca ON ca.business_id = p_business_id AND ca.party_id = c.counterparty_party_id
    LEFT JOIN public.inter_account_transfers x ON x.business_id = p_business_id AND x.document_id = r.id
    LEFT JOIN public.bank_accounts fb ON fb.business_id = p_business_id AND fb.id = x.from_bank_account_id
    LEFT JOIN public.bank_accounts tb ON tb.business_id = p_business_id AND tb.id = x.to_bank_account_id
    WHERE (p_from IS NULL OR r.document_date >= p_from)
      AND public.has_area_access(p_business_id, 'bank_cash_accounts', 'view')
    ORDER BY r.document_date DESC, r.id DESC
    OFFSET p_offset LIMIT p_limit;
$$;

-- 2. Dashboard figures + overdue sales invoices
DROP FUNCTION IF EXISTS public.dashboard_business_figures(uuid[], date, date);

CREATE FUNCTION public.dashboard_business_figures(p_business_ids uuid[], p_from date, p_to date)
RETURNS TABLE (business_id uuid, cash numeric, receivables numeric, payables numeric,
               net_profit numeric, suspense numeric, overdue_count bigint, overdue_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH biz AS (
        SELECT b.id,
               public.has_area_access(b.id, 'bank_cash_accounts', 'view') AS can_cash,
               public.has_area_access(b.id, 'customers', 'view') AS can_receivables,
               public.has_area_access(b.id, 'suppliers', 'view') AS can_payables,
               public.has_area_access(b.id, 'summary', 'view') AS can_profit,
               public.has_area_access(b.id, 'suspense', 'view') AS can_suspense,
               public.has_area_access(b.id, 'sales_invoices', 'view') AS can_invoices
        FROM public.businesses b
        WHERE b.id = ANY(p_business_ids) AND public.is_business_member(b.id)
    ),
    sums AS (
        SELECT l.business_id,
               sum(l.debit - l.credit) FILTER (WHERE s.code = 'cash_control') AS cash,
               sum(l.debit - l.credit) FILTER (WHERE s.code = 'accounts_receivable') AS receivables,
               sum(l.credit - l.debit) FILTER (WHERE s.code = 'accounts_payable') AS payables,
               sum(l.credit - l.debit) FILTER (WHERE r.statement_type <> 'balance_sheet'
                                                 AND COALESCE(l.line_date, e.entry_date) >= p_from) AS net_profit,
               sum(l.credit - l.debit) FILTER (WHERE s.code = 'suspense') AS suspense
        FROM biz
        JOIN public.journal_lines l ON l.business_id = biz.id
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.coa_root_groups r ON r.account_type = a.type
        LEFT JOIN public.system_account_types s ON s.id = a.system_account_type_id
        WHERE COALESCE(l.line_date, e.entry_date) <= p_to
        GROUP BY l.business_id
    ),
    -- Balance due as at p_to = total + posted late fees - posted allocations (domain-model §5.1).
    due AS (
        SELECT d.business_id, t.total + COALESCE(f.amount, 0) - COALESCE(a.amount, 0) AS balance_due
        FROM biz
        JOIN public.documents d ON d.business_id = biz.id AND d.document_date <= p_to
        JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = 'sales_invoice'
        JOIN public.document_statuses st ON st.id = d.status_id AND st.key = 'posted'
        JOIN public.invoice_terms it ON it.business_id = d.business_id AND it.document_id = d.id
                                    AND it.due_date < p_to
        JOIN public.trade_document_totals t ON t.business_id = d.business_id AND t.document_id = d.id
        LEFT JOIN LATERAL (
            SELECT sum(lf.amount) AS amount FROM public.late_payment_fees lf
            JOIN public.documents fd ON fd.business_id = lf.business_id AND fd.id = lf.document_id
            JOIN public.document_statuses fs ON fs.id = fd.status_id AND fs.key = 'posted'
            WHERE lf.business_id = d.business_id AND lf.invoice_document_id = d.id AND fd.document_date <= p_to
        ) f ON true
        LEFT JOIN LATERAL (
            SELECT sum(pa.amount + pa.early_discount) AS amount FROM public.payment_allocations pa
            JOIN public.documents sd ON sd.business_id = pa.business_id AND sd.id = pa.settling_document_id
            JOIN public.document_statuses ss ON ss.id = sd.status_id AND ss.key = 'posted'
            WHERE pa.business_id = d.business_id AND pa.invoice_document_id = d.id AND sd.document_date <= p_to
        ) a ON true
        WHERE biz.can_invoices
    ),
    overdue AS (
        SELECT due.business_id, count(*) AS n, sum(due.balance_due) AS amount
        FROM due WHERE due.balance_due > 0
        GROUP BY due.business_id
    )
    SELECT biz.id,
           CASE WHEN biz.can_cash THEN COALESCE(sums.cash, 0) END,
           CASE WHEN biz.can_receivables THEN COALESCE(sums.receivables, 0) END,
           CASE WHEN biz.can_payables THEN COALESCE(sums.payables, 0) END,
           CASE WHEN biz.can_profit THEN COALESCE(sums.net_profit, 0) END,
           CASE WHEN biz.can_suspense THEN COALESCE(sums.suspense, 0) END,
           CASE WHEN biz.can_invoices THEN COALESCE(overdue.n, 0) END,
           CASE WHEN biz.can_invoices THEN COALESCE(overdue.amount, 0) END
    FROM biz
    LEFT JOIN sums ON sums.business_id = biz.id
    LEFT JOIN overdue ON overdue.business_id = biz.id;
$$;

REVOKE EXECUTE ON FUNCTION public.bank_account_transactions(uuid, uuid, date, date, integer, integer),
    public.dashboard_business_figures(uuid[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_account_transactions(uuid, uuid, date, date, integer, integer),
    public.dashboard_business_figures(uuid[], date, date) TO bookvault_api;

GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.bank_account_transactions(uuid, uuid, date, date, integer, integer) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.dashboard_business_figures(uuid[], date, date) OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;
