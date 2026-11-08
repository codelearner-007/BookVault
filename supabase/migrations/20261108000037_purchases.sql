-- ==============================================
-- Migration: suppliers and purchases on the AP sub-ledger (B5; domain-model §1a, §5.4;
-- posting-rules PR-38, PR-41c, PR-42, PR-43, PR-61, PR-64; D-36)
-- Date: 2026-11-08
--
-- * suppliers (party extension, NA-10) gain credit limit, currency placeholder (NULL = base, B8),
--   division placeholder (B15), is_inactive. Existing rows are kept.
-- * Purchase quotes, orders, invoices, debit notes and goods receipts are trade_documents (same
--   tables as B4); their document types, areas and link types.
-- * trade_documents.acts_as_stock_movement ("also acts as goods receipt"; stock effect in B6);
--   trade_line_kinds (standard, freight) + trade_document_lines.line_kind_key (freight-in posts
--   in B7, PR-41b). Closed purchase invoices use invoice_terms.is_closed (B4 column, PR-41c).
-- * Starting-balance purchase invoices: opening_balances kind purchase_invoice (PR-61, D-36).
-- * Definer aggregates: invoice_balances gains the invoice type and is_closed (AP side read by
--   payments and debit notes); invoice_applications readable from the purchase areas;
--   supplier_summaries (AP balance, credit-positive).
-- * Pickers: tax codes, items, accounts and suppliers readable from the purchase areas.
-- * Purchase tabs on by default for new businesses.
-- * The pre-B3 receipt tables were dropped in 20261108000033 (signed off); nothing is left to drop.
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.supplier_summaries(uuid), public.invoice_balances(uuid, uuid[], uuid, text);
--   re-create invoice_balances(uuid, uuid[], uuid) and invoice_applications from 20261108000034;
--   restore the opening_balances CHECK from 20261108000034; DELETE kind purchase_invoice;
--   ALTER TABLE public.trade_document_lines DROP COLUMN line_kind_key; DROP TABLE public.trade_line_kinds;
--   ALTER TABLE public.trade_documents DROP COLUMN acts_as_stock_movement;
--   DELETE the B5 document_link_types, document_type_areas and document_types rows;
--   ALTER TABLE public.suppliers DROP COLUMN credit_limit, currency_id, division_id, is_inactive;
--   restore the select policies of tax_codes, items, coa_accounts, suppliers from 20261108000034 / 000030.
-- ==============================================

BEGIN;

-- 1. Suppliers (party extension)
ALTER TABLE public.suppliers
    ADD COLUMN credit_limit NUMERIC(19,4) NULL CHECK (credit_limit >= 0),
    ADD COLUMN currency_id  UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    ADD COLUMN division_id  UUID NULL CONSTRAINT suppliers_division_id_unused CHECK (division_id IS NULL),
    ADD COLUMN is_inactive  BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_suppliers_currency_id ON public.suppliers (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_suppliers_business_name ON public.suppliers (business_id, name);

-- 2. Document types, areas, links, opening kind
INSERT INTO public.document_types (key, name) VALUES
    ('purchase_quote', 'Purchase quote'), ('purchase_order', 'Purchase order'),
    ('purchase_invoice', 'Purchase invoice'), ('debit_note', 'Debit note'), ('goods_receipt', 'Goods receipt');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT t.id, v.area_key
FROM (VALUES ('purchase_quote', 'purchase_quotes'), ('purchase_order', 'purchase_orders'),
             ('purchase_invoice', 'purchase_invoices'), ('debit_note', 'debit_notes'),
             ('goods_receipt', 'goods_receipts')) AS v(type_key, area_key)
JOIN public.document_types t ON t.key = v.type_key;

INSERT INTO public.document_link_types (key, name) VALUES
    ('purchase_quote_to_order', 'Purchase quote to purchase order'),
    ('purchase_quote_to_invoice', 'Purchase quote to purchase invoice'),
    ('purchase_order_to_invoice', 'Purchase order to purchase invoice'),
    ('purchase_order_to_goods_receipt', 'Purchase order to goods receipt'),
    ('purchase_invoice_to_debit_note', 'Purchase invoice to debit note');

INSERT INTO public.opening_balance_kinds (key, name) VALUES ('purchase_invoice', 'Starting-balance purchase invoice');

-- 3. Trade-document columns of the purchase forms
ALTER TABLE public.trade_documents
    ADD COLUMN acts_as_stock_movement BOOLEAN NOT NULL DEFAULT false;  -- stock effect: B6

CREATE TABLE public.trade_line_kinds (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.trade_line_kinds (key, name) VALUES ('standard', 'Standard line'), ('freight', 'Freight-in');
ALTER TABLE public.trade_document_lines
    ADD COLUMN line_kind_key TEXT NOT NULL DEFAULT 'standard'
        REFERENCES public.trade_line_kinds(key) ON DELETE RESTRICT;
CREATE INDEX idx_trade_document_lines_line_kind ON public.trade_document_lines (line_kind_key);

-- 4. Starting-balance purchase invoices (PR-61, D-36)
ALTER TABLE public.opening_balances
    DROP CONSTRAINT opening_balances_source_matches_kind,
    ADD CONSTRAINT opening_balances_source_matches_kind CHECK (
        (kind_key = 'account') = (account_id IS NOT NULL)
        AND (kind_key = 'bank_account') = (bank_account_id IS NOT NULL)
        AND (kind_key IN ('sales_invoice', 'purchase_invoice')) = (invoice_document_id IS NOT NULL)
        AND (kind_key IN ('sales_invoice', 'purchase_invoice')) = (paid_before_start IS NOT NULL));

-- 5. Definer aggregates (B0.4: totals only, the caller's view right checked), owned by
-- bookvault_rls_owner (as in 20261108000034): replaced as that role.
GRANT SELECT ON public.suppliers, public.coa_accounts, public.system_account_types TO bookvault_rls_owner;
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
SET ROLE bookvault_rls_owner;
DROP FUNCTION public.invoice_balances(uuid, uuid[], uuid);
-- Balance due of posted invoices of one type (sales: AR, purchase: AP) = total + late fees -
-- allocations from posted settling documents; is_closed excludes a purchase invoice from
-- allocation pickers and auto-matching (PR-41c), never from lists or balances.
CREATE OR REPLACE FUNCTION public.invoice_balances(p_business_id uuid, p_ids uuid[], p_party_id uuid,
                                                   p_type text DEFAULT 'sales_invoice')
RETURNS TABLE (invoice_document_id uuid, party_id uuid, document_date date, reference text, due_date date,
               total numeric, fees numeric, applied numeric, balance_due numeric,
               early_discount_rate numeric, early_discount_days integer, late_fee_rate numeric, is_closed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.id, td.party_id, d.document_date, d.reference, it.due_date, t.total,
           COALESCE(f.amount, 0), COALESCE(a.amount, 0), t.total + COALESCE(f.amount, 0) - COALESCE(a.amount, 0),
           it.early_discount_rate, it.early_discount_days, it.late_fee_rate, it.is_closed
    FROM public.documents d
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = p_type
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    JOIN public.trade_documents td ON td.business_id = d.business_id AND td.document_id = d.id
    JOIN public.invoice_terms it ON it.business_id = d.business_id AND it.document_id = d.id
    JOIN public.trade_document_totals t ON t.business_id = d.business_id AND t.document_id = d.id
    LEFT JOIN LATERAL (
        SELECT sum(lf.amount) AS amount FROM public.late_payment_fees lf
        JOIN public.documents fd ON fd.business_id = lf.business_id AND fd.id = lf.document_id
        JOIN public.document_statuses fs ON fs.id = fd.status_id AND fs.key = 'posted'
        WHERE lf.business_id = d.business_id AND lf.invoice_document_id = d.id
    ) f ON true
    LEFT JOIN LATERAL (
        SELECT sum(pa.amount + pa.early_discount) AS amount FROM public.payment_allocations pa
        JOIN public.documents sd ON sd.business_id = pa.business_id AND sd.id = pa.settling_document_id
        JOIN public.document_statuses ss ON ss.id = sd.status_id AND ss.key = 'posted'
        WHERE pa.business_id = d.business_id AND pa.invoice_document_id = d.id
    ) a ON true
    WHERE d.business_id = p_business_id
      AND (p_ids IS NULL OR d.id = ANY(p_ids))
      AND (p_party_id IS NULL OR td.party_id = p_party_id)
      AND (public.has_area_access(p_business_id, 'reports', 'view')
           OR (p_type = 'sales_invoice' AND (
                  public.has_area_access(p_business_id, 'sales_invoices', 'view')
                  OR public.has_area_access(p_business_id, 'customers', 'view')
                  OR public.has_area_access(p_business_id, 'receipts', 'view')
                  OR public.has_area_access(p_business_id, 'credit_notes', 'view')
                  OR public.has_area_access(p_business_id, 'late_payment_fees', 'view')))
           OR (p_type = 'purchase_invoice' AND (
                  public.has_area_access(p_business_id, 'purchase_invoices', 'view')
                  OR public.has_area_access(p_business_id, 'suppliers', 'view')
                  OR public.has_area_access(p_business_id, 'payments', 'view')
                  OR public.has_area_access(p_business_id, 'debit_notes', 'view'))));
$$;

CREATE OR REPLACE FUNCTION public.invoice_applications(p_business_id uuid, p_invoice_id uuid)
RETURNS TABLE (document_id uuid, document_type text, document_date date, reference text,
               amount numeric, early_discount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT sd.id, t.key, sd.document_date, sd.reference, pa.amount, pa.early_discount
    FROM public.payment_allocations pa
    JOIN public.documents sd ON sd.business_id = pa.business_id AND sd.id = pa.settling_document_id
    JOIN public.document_statuses ss ON ss.id = sd.status_id AND ss.key = 'posted'
    JOIN public.document_types t ON t.id = sd.document_type_id
    WHERE pa.business_id = p_business_id AND pa.invoice_document_id = p_invoice_id
      AND (public.has_area_access(p_business_id, 'sales_invoices', 'view')
           OR public.has_area_access(p_business_id, 'customers', 'view')
           OR public.has_area_access(p_business_id, 'purchase_invoices', 'view')
           OR public.has_area_access(p_business_id, 'suppliers', 'view'))
    ORDER BY sd.document_date, sd.id;
$$;

-- Suppliers list: AP balance (Accounts payable lines only, credit-positive) and AP history.
CREATE OR REPLACE FUNCTION public.supplier_summaries(p_business_id uuid)
RETURNS TABLE (party_id uuid, ap_balance numeric, has_history boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH ap AS (
        SELECT l.party_id, sum(l.credit - l.debit) AS balance
        FROM public.journal_lines l
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.system_account_types st ON st.id = a.system_account_type_id AND st.code = 'accounts_payable'
        WHERE l.business_id = p_business_id AND l.party_id IS NOT NULL
        GROUP BY l.party_id
    )
    SELECT s.id, COALESCE(ap.balance, 0), ap.party_id IS NOT NULL
    FROM public.suppliers s
    LEFT JOIN ap ON ap.party_id = s.id
    WHERE s.business_id = p_business_id
      AND public.has_area_access(p_business_id, 'suppliers', 'view');
$$;

REVOKE EXECUTE ON FUNCTION public.invoice_balances(uuid, uuid[], uuid, text), public.supplier_summaries(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_balances(uuid, uuid[], uuid, text), public.supplier_summaries(uuid)
    TO bookvault_api;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 6. Reference data and pickers readable from the purchase areas
REVOKE ALL ON public.trade_line_kinds FROM PUBLIC, anon, authenticated;
ALTER TABLE public.trade_line_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_line_kinds FORCE ROW LEVEL SECURITY;
GRANT ALL ON public.trade_line_kinds TO service_role;
CREATE POLICY trade_line_kinds_service_role_all ON public.trade_line_kinds TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.trade_line_kinds TO bookvault_api, bookvault_rls_owner;
CREATE POLICY trade_line_kinds_api_select ON public.trade_line_kinds FOR SELECT TO bookvault_api USING (true);

DROP POLICY tax_codes_api_select ON public.tax_codes;
CREATE POLICY tax_codes_api_select ON public.tax_codes FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.tax_codes', 'view')
                OR public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'purchase_quotes', 'view')
                OR public.has_area_access(business_id, 'purchase_orders', 'view')
                OR public.has_area_access(business_id, 'purchase_invoices', 'view')
                OR public.has_area_access(business_id, 'debit_notes', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
DROP POLICY items_api_select ON public.items;
CREATE POLICY items_api_select ON public.items FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'delivery_notes', 'view')
                OR public.has_area_access(business_id, 'purchase_quotes', 'view')
                OR public.has_area_access(business_id, 'purchase_orders', 'view')
                OR public.has_area_access(business_id, 'purchase_invoices', 'view')
                OR public.has_area_access(business_id, 'debit_notes', 'view')
                OR public.has_area_access(business_id, 'goods_receipts', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
DROP POLICY coa_accounts_api_select ON public.coa_accounts;
CREATE POLICY coa_accounts_api_select ON public.coa_accounts FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.chart_of_accounts', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'inter_account_transfers', 'view')
                OR public.has_area_access(business_id, 'journal_entries', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'late_payment_fees', 'view')
                OR public.has_area_access(business_id, 'purchase_quotes', 'view')
                OR public.has_area_access(business_id, 'purchase_orders', 'view')
                OR public.has_area_access(business_id, 'purchase_invoices', 'view')
                OR public.has_area_access(business_id, 'debit_notes', 'view')
                OR public.has_area_access(business_id, 'settings.tax_codes', 'view')
                OR public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
DROP POLICY suppliers_api_select ON public.suppliers;
CREATE POLICY suppliers_api_select ON public.suppliers FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'suppliers', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'purchase_quotes', 'view')
                OR public.has_area_access(business_id, 'purchase_orders', 'view')
                OR public.has_area_access(business_id, 'purchase_invoices', 'view')
                OR public.has_area_access(business_id, 'debit_notes', 'view')
                OR public.has_area_access(business_id, 'goods_receipts', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));

-- 7. Purchase tabs on by default for new businesses (build-plan B5)
UPDATE public.admin_tabs SET default_enabled = true
WHERE key IN ('suppliers', 'purchase-quotes', 'purchase-orders', 'purchase-invoices', 'debit-notes',
              'goods-receipts');

COMMIT;
