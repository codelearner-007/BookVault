-- ==============================================
-- Migration: inventory aggregates, party credits and purge coverage (B6; domain-model §5.5, §8 INV-3/4;
-- posting-rules PR-03, PR-64; T58, T76)
-- Date: 2026-11-08
--
-- Definer aggregates (B0.4: totals only, the caller's view right checked), owned by bookvault_rls_owner:
-- * inventory_item_stock(): per inventory item qty owned / on hand / to deliver / to receive / reserved
--   (open sales orders) / on order (open purchase orders) and total cost (Σ stock movement amounts).
-- * customer_summaries() gains qty_to_deliver, supplier_summaries() gains qty_to_receive.
-- * party_credits(): unapplied credit of a party per settling document (receipt overpayment, credit /
--   debit note remainder). A new invoice of that party absorbs it oldest first (Manager T58: the 120
--   credit of T32 is applied to T58 automatically), as stored payment allocations.
-- * invoice_applications() flags credit applications (an allocation with no ledger line of its own),
--   which voiding the invoice releases.
-- * item_in_use() covers the inventory tables.
-- * payment_allocations: insert / delete by a writer of either side (settling document or invoice).
-- * Purge and export cover the inventory tables.
--
-- ROLLBACK (run manually):
--   DROP FUNCTION public.inventory_item_stock(uuid), public.party_credits(uuid, uuid, text);
--   re-create customer_summaries(uuid) and invoice_applications(uuid, uuid) from 20261108000037 / 000034,
--   supplier_summaries(uuid) from 20261108000037, item_in_use(uuid, uuid) from 20261108000034,
--   the payment_allocations insert / delete policies from 20261108000031 / 000034 and
--   business_scoped_tables() from 20261108000034.
-- ==============================================

BEGIN;

GRANT SELECT ON public.document_links, public.document_types, public.document_statuses, public.trade_document_lines,
    public.journal_entries, public.payment_allocations, public.opening_balances, public.kit_components,
    public.stock_document_lines, public.production_orders, public.cash_transaction_lines TO bookvault_rls_owner;
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
SET ROLE bookvault_rls_owner;

-- 1. Stock per inventory item. To deliver / to receive = what sales (purchase) documents moved in
-- owned qty but not yet on hand; reserved / on order = posted orders with no live invoice or stock document.
CREATE OR REPLACE FUNCTION public.inventory_item_stock(p_business_id uuid)
RETURNS TABLE (item_id uuid, qty_owned numeric, qty_on_hand numeric, qty_to_deliver numeric,
               qty_to_receive numeric, qty_reserved numeric, qty_on_order numeric, total_cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH moves AS (
        SELECT m.item_id, sum(m.qty_owned) AS owned, sum(m.qty_on_hand) AS on_hand, sum(m.amount) AS cost,
               sum(CASE WHEN ty.key IN ('sales_invoice', 'credit_note', 'delivery_note')
                        THEN m.qty_on_hand - m.qty_owned ELSE 0 END) AS to_deliver,
               sum(CASE WHEN ty.key IN ('purchase_invoice', 'debit_note', 'goods_receipt')
                        THEN m.qty_owned - m.qty_on_hand ELSE 0 END) AS to_receive
        FROM public.stock_movements m
        JOIN public.documents d ON d.business_id = m.business_id AND d.id = m.document_id
        JOIN public.document_types ty ON ty.id = d.document_type_id
        WHERE m.business_id = p_business_id
        GROUP BY m.item_id
    ), open_orders AS (
        SELECT l.item_id, ty.key AS type_key, sum(l.qty) AS qty
        FROM public.documents d
        JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key IN ('sales_order', 'purchase_order')
        JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
        JOIN public.trade_document_lines l ON l.business_id = d.business_id AND l.document_id = d.id
        WHERE d.business_id = p_business_id AND l.item_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.document_links k
            JOIN public.documents t ON t.business_id = k.business_id AND t.id = k.to_document_id
            JOIN public.document_statuses ts ON ts.id = t.status_id AND ts.key <> 'void'
            WHERE k.business_id = d.business_id AND k.from_document_id = d.id
              AND k.link_type_key IN ('order_to_invoice', 'order_to_delivery', 'purchase_order_to_invoice',
                                      'purchase_order_to_goods_receipt'))
        GROUP BY l.item_id, ty.key
    )
    SELECT i.item_id, COALESCE(mv.owned, 0), COALESCE(mv.on_hand, 0), COALESCE(mv.to_deliver, 0),
           COALESCE(mv.to_receive, 0), COALESCE(r.qty, 0), COALESCE(o.qty, 0), COALESCE(mv.cost, 0)
    FROM public.inventory_items i
    LEFT JOIN moves mv ON mv.item_id = i.item_id
    LEFT JOIN open_orders r ON r.item_id = i.item_id AND r.type_key = 'sales_order'
    LEFT JOIN open_orders o ON o.item_id = i.item_id AND o.type_key = 'purchase_order'
    WHERE i.business_id = p_business_id
      AND public.is_business_member(p_business_id)
      AND (public.has_area_access(p_business_id, 'inventory_items', 'view')
           OR public.has_area_access(p_business_id, 'reports', 'view')
           OR public.has_area_access(p_business_id, 'sales_invoices', 'view')
           OR public.has_area_access(p_business_id, 'delivery_notes', 'view')
           OR public.has_area_access(p_business_id, 'purchase_invoices', 'view')
           OR public.has_area_access(p_business_id, 'goods_receipts', 'view')
           OR public.has_area_access(p_business_id, 'inventory_transfers', 'view')
           OR public.has_area_access(p_business_id, 'inventory_write_offs', 'view')
           OR public.has_area_access(p_business_id, 'production_orders', 'view'));
$$;

-- 2. Customers and suppliers lists gain their stock column (Manager: Qty to deliver / Qty to receive).
DROP FUNCTION public.customer_summaries(uuid);
CREATE FUNCTION public.customer_summaries(p_business_id uuid)
RETURNS TABLE (party_id uuid, ar_balance numeric, has_history boolean, uninvoiced numeric, qty_to_deliver numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH ar AS (
        SELECT l.party_id, sum(l.debit - l.credit) AS balance
        FROM public.journal_lines l
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.system_account_types st ON st.id = a.system_account_type_id AND st.code = 'accounts_receivable'
        WHERE l.business_id = p_business_id AND l.party_id IS NOT NULL
        GROUP BY l.party_id
    ), orders AS (
        SELECT td.party_id, sum(t.total) AS amount
        FROM public.documents d
        JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = 'sales_order'
        JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
        JOIN public.trade_documents td ON td.business_id = d.business_id AND td.document_id = d.id
        JOIN public.trade_document_totals t ON t.business_id = d.business_id AND t.document_id = d.id
        WHERE d.business_id = p_business_id AND NOT EXISTS (
            SELECT 1 FROM public.document_links k
            JOIN public.documents inv ON inv.business_id = k.business_id AND inv.id = k.to_document_id
            JOIN public.document_statuses vs ON vs.id = inv.status_id AND vs.key <> 'void'
            WHERE k.business_id = d.business_id AND k.from_document_id = d.id AND k.link_type_key = 'order_to_invoice')
        GROUP BY td.party_id
    ), stock AS (
        SELECT td.party_id, sum(m.qty_on_hand - m.qty_owned) AS qty
        FROM public.stock_movements m
        JOIN public.trade_documents td ON td.business_id = m.business_id AND td.document_id = m.document_id
        WHERE m.business_id = p_business_id
        GROUP BY td.party_id
    )
    SELECT c.id, COALESCE(ar.balance, 0), ar.party_id IS NOT NULL, COALESCE(o.amount, 0), COALESCE(st.qty, 0)
    FROM public.customers c
    LEFT JOIN ar ON ar.party_id = c.id
    LEFT JOIN orders o ON o.party_id = c.id
    LEFT JOIN stock st ON st.party_id = c.id
    WHERE c.business_id = p_business_id
      AND public.has_area_access(p_business_id, 'customers', 'view');
$$;

DROP FUNCTION public.supplier_summaries(uuid);
CREATE FUNCTION public.supplier_summaries(p_business_id uuid)
RETURNS TABLE (party_id uuid, ap_balance numeric, has_history boolean, qty_to_receive numeric)
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
    ), stock AS (
        SELECT td.party_id, sum(m.qty_owned - m.qty_on_hand) AS qty
        FROM public.stock_movements m
        JOIN public.trade_documents td ON td.business_id = m.business_id AND td.document_id = m.document_id
        WHERE m.business_id = p_business_id
        GROUP BY td.party_id
    )
    SELECT s.id, COALESCE(ap.balance, 0), ap.party_id IS NOT NULL, COALESCE(st.qty, 0)
    FROM public.suppliers s
    LEFT JOIN ap ON ap.party_id = s.id
    LEFT JOIN stock st ON st.party_id = s.id
    WHERE s.business_id = p_business_id
      AND public.has_area_access(p_business_id, 'suppliers', 'view');
$$;

-- 3. Unapplied credit of a party per settling document: its control-account credit (AR) / debit (AP)
-- over every entry of the document, minus what its allocations already settle.
CREATE OR REPLACE FUNCTION public.party_credits(p_business_id uuid, p_party_id uuid, p_control text)
RETURNS TABLE (settling_document_id uuid, document_date date, available numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH moved AS (
        SELECT e.document_id,
               sum(CASE WHEN p_control = 'accounts_receivable' THEN l.credit - l.debit ELSE l.debit - l.credit END)
                   AS amount
        FROM public.journal_lines l
        JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
        JOIN public.coa_accounts a ON a.business_id = l.business_id AND a.id = l.account_id
        JOIN public.system_account_types st ON st.id = a.system_account_type_id AND st.code = p_control
        WHERE l.business_id = p_business_id AND l.party_id = p_party_id
        GROUP BY e.document_id
    )
    SELECT d.id, d.document_date, mv.amount - COALESCE(pa.amount, 0)
    FROM moved mv
    JOIN public.documents d ON d.business_id = p_business_id AND d.id = mv.document_id
    JOIN public.document_statuses s ON s.id = d.status_id AND s.key = 'posted'
    LEFT JOIN LATERAL (
        SELECT sum(x.amount + x.early_discount) AS amount FROM public.payment_allocations x
        WHERE x.business_id = d.business_id AND x.settling_document_id = d.id
    ) pa ON true
    WHERE p_control IN ('accounts_receivable', 'accounts_payable')
      AND mv.amount - COALESCE(pa.amount, 0) > 0
      AND (public.has_area_access(p_business_id, 'sales_invoices', 'view')
           OR public.has_area_access(p_business_id, 'purchase_invoices', 'view')
           OR public.has_area_access(p_business_id, 'customers', 'view')
           OR public.has_area_access(p_business_id, 'suppliers', 'view'))
    ORDER BY d.document_date, d.id;
$$;

-- 4. What settled one invoice; a credit application has no ledger line naming the invoice.
DROP FUNCTION public.invoice_applications(uuid, uuid);
CREATE FUNCTION public.invoice_applications(p_business_id uuid, p_invoice_id uuid)
RETURNS TABLE (document_id uuid, document_type text, document_date date, reference text,
               amount numeric, early_discount numeric, is_credit_application boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT sd.id, t.key, sd.document_date, sd.reference, pa.amount, pa.early_discount,
           t.key <> 'opening_balance' AND NOT EXISTS (
               SELECT 1 FROM public.journal_lines l
               JOIN public.journal_entries e ON e.business_id = l.business_id AND e.id = l.journal_entry_id
               WHERE e.business_id = pa.business_id AND e.document_id = sd.id
                 AND l.invoice_document_id = p_invoice_id)
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

REVOKE EXECUTE ON FUNCTION public.inventory_item_stock(uuid), public.customer_summaries(uuid),
    public.supplier_summaries(uuid), public.party_credits(uuid, uuid, text), public.invoice_applications(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_item_stock(uuid), public.customer_summaries(uuid),
    public.supplier_summaries(uuid), public.party_credits(uuid, uuid, text), public.invoice_applications(uuid, uuid)
    TO bookvault_api;
-- 5. Reference checks behind the 409 of an item delete (owned by bookvault_rls_owner since 20261108000034).
CREATE OR REPLACE FUNCTION public.item_in_use(p_business_id uuid, p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_business_member(p_business_id) AND (
        EXISTS (SELECT 1 FROM public.trade_document_lines WHERE business_id = p_business_id AND item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.cash_transaction_lines WHERE business_id = p_business_id AND item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.stock_movements WHERE business_id = p_business_id AND item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.stock_document_lines WHERE business_id = p_business_id AND item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.production_orders
                   WHERE business_id = p_business_id AND finished_item_id = p_item_id)
        OR EXISTS (SELECT 1 FROM public.kit_components
                   WHERE business_id = p_business_id AND component_item_id = p_item_id));
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 6. An allocation joins a settling document and an invoice: a writer of either may create or remove it
-- (an invoice absorbs its party's credit; voiding it releases that credit).
DROP POLICY payment_allocations_api_insert ON public.payment_allocations;
CREATE POLICY payment_allocations_api_insert ON public.payment_allocations FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, settling_document_id))
                OR public.has_area_write_access(business_id, public.document_area_key(business_id, invoice_document_id)));
DROP POLICY payment_allocations_api_delete ON public.payment_allocations;
CREATE POLICY payment_allocations_api_delete ON public.payment_allocations FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, settling_document_id))
           OR public.has_area_write_access(business_id, public.document_area_key(business_id, invoice_document_id)));

-- 7. Purge and export cover the inventory tables (children first)
GRANT SELECT, DELETE ON public.inventory_items, public.kit_components,
    public.inventory_locations, public.stock_documents, public.stock_document_lines, public.production_orders,
    public.stock_movements, public.inventory_cost_corrections TO bookvault_purge;
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
        'payment_allocations', 'document_links', 'journal_lines', 'journal_entries', 'opening_balances',
        'inventory_cost_corrections', 'stock_movements', 'production_orders', 'stock_document_lines',
        'stock_documents', 'late_payment_fees', 'invoice_terms', 'trade_document_lines', 'trade_documents',
        'cash_transaction_lines', 'cash_transactions', 'inter_account_transfers', 'document_lines',
        'documents', 'document_sequences', 'kit_components', 'inventory_items', 'items', 'inventory_locations',
        'tax_code_components', 'tax_codes', 'business_currencies', 'capital_accounts', 'bank_accounts',
        'customers', 'suppliers', 'parties', 'coa_accounts', 'coa_groups', 'business_tab_columns',
        'business_tabs', 'business_format', 'business_details', 'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;

COMMIT;
