-- ==============================================
-- Migration: workspace dashboard figures (one batched aggregate over the ledger)
-- Date: 2026-11-08
--
-- public.dashboard_business_figures(ids, from, to): per business the caller is an active member of,
-- the headline figures from the stored ledger, each only when the caller may view its area:
--   cash          Cash & cash equivalents as at p_to          (bank_cash_accounts:view)
--   receivables   Accounts receivable as at p_to              (customers:view)
--   payables      Accounts payable as at p_to, credit-positive (suppliers:view)
--   net_profit    income - expenses over [p_from, p_to]       (summary:view)
--   suspense      Suspense as at p_to, credit-positive        (suspense:view)
-- A figure the caller may not view is NULL; a business the caller is not a member of is not returned
-- (ids of other tenants are ignored). SECURITY DEFINER like bank_account_balances (B0.4): RLS would
-- show a custom member only part of the ledger, so totals are computed over every line, rights checked here.
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.dashboard_business_figures(uuid[], date, date);
--   REVOKE SELECT ON public.coa_root_groups FROM bookvault_rls_owner;
-- ==============================================

GRANT SELECT ON public.coa_root_groups TO bookvault_rls_owner;

CREATE OR REPLACE FUNCTION public.dashboard_business_figures(p_business_ids uuid[], p_from date, p_to date)
RETURNS TABLE (business_id uuid, cash numeric, receivables numeric, payables numeric,
               net_profit numeric, suspense numeric)
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
               public.has_area_access(b.id, 'suspense', 'view') AS can_suspense
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
    )
    SELECT biz.id,
           CASE WHEN biz.can_cash THEN COALESCE(sums.cash, 0) END,
           CASE WHEN biz.can_receivables THEN COALESCE(sums.receivables, 0) END,
           CASE WHEN biz.can_payables THEN COALESCE(sums.payables, 0) END,
           CASE WHEN biz.can_profit THEN COALESCE(sums.net_profit, 0) END,
           CASE WHEN biz.can_suspense THEN COALESCE(sums.suspense, 0) END
    FROM biz
    LEFT JOIN sums ON sums.business_id = biz.id;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_business_figures(uuid[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_business_figures(uuid[], date, date) TO bookvault_api;

GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.dashboard_business_figures(uuid[], date, date) OWNER TO bookvault_rls_owner;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;
