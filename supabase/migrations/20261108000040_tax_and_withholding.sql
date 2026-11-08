-- ==============================================
-- Migration: full tax codes and withholding tax (B7; posting-rules PR-17, PR-18, PR-21, PR-29, PR-36,
-- PR-40, PR-41a/b, BUG-01; build-plan D-27; fixtures T39, T53-T55, T57, T77, T78, T80-T82)
-- Date: 2026-11-08
--
-- * tax_codes.is_reverse_charge; several components per code (the single-component index goes).
-- * trade_document_lines.tax_reverse_charge (snapshot, BUG-08) and trade_document_line_taxes: the
--   rate and account of every component a line was saved with. The line's tax stays one rounded
--   figure (half away from zero, T82); the posting splits it over the components by rate, the last
--   component taking the remainder.
-- * Reverse charge (PR-40): the line's tax is not owed to the supplier; trade_document_line_amounts
--   reports it as self_assessed_tax and tax = 0.
-- * Freight-in (PR-41b): trade_document_freight_lines on purchase invoices; added to the subtotal and
--   capitalised to the inventory lines by value (service).
-- * Withholding tax (PR-21, PR-41a): trade_documents.wht_type_key (percentage | amount) + wht_value;
--   business_settings.wht_receivable_enabled / wht_payable_enabled (show the fields only, BUG-01: a
--   setting never removes a line) and wht_base_key (gross incl. tax = default, D-27 | net).
--   trade_document_totals: total = amount due after WHT (Manager prints it as Total); gross_total =
--   before WHT; withholding_tax; freight.
-- * withholding_tax_receipts (PR-36): document type withholding_tax_receipt, area withholding_tax_receipts.
-- * Guards, RLS, grants, pickers, purge / export coverage.
--
-- ROLLBACK (run manually, newest first):
--   DROP TABLE public.withholding_tax_receipts, public.trade_document_freight_lines,
--     public.trade_document_line_taxes;
--   re-create trade_document_line_amounts / trade_document_totals from 20261108000034 (DROP ... CASCADE
--     is not needed: CREATE OR REPLACE with the old bodies, after dropping the appended columns via
--     DROP VIEW + CREATE VIEW and re-granting);
--   ALTER TABLE public.trade_documents DROP COLUMN wht_type_key, DROP COLUMN wht_value;
--   ALTER TABLE public.trade_document_lines DROP COLUMN tax_reverse_charge;
--   ALTER TABLE public.business_settings DROP COLUMN wht_receivable_enabled, DROP COLUMN wht_payable_enabled,
--     DROP COLUMN wht_base_key;
--   DROP TABLE public.wht_types, public.wht_bases;
--   ALTER TABLE public.tax_codes DROP COLUMN is_reverse_charge;
--   CREATE UNIQUE INDEX uq_tax_code_components_single ON public.tax_code_components (business_id, tax_code_id)
--     (only when no code has two components);
--   restore business_settings_column_guard(), customers_api_select and business_scoped_tables() from 20261108000034 / 20261108000039; DELETE the withholding_tax_receipt
--   document_type_areas and document_types rows.
-- ==============================================

BEGIN;

-- 1. Reference data
CREATE TABLE public.wht_types (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.wht_types (key, name) VALUES ('percentage', 'Rate (%)'), ('amount', 'Exact amount');

CREATE TABLE public.wht_bases (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.wht_bases (key, name) VALUES
    ('gross', 'Total including tax'), ('net', 'Total before tax');

-- 2. Withholding tax settings (display only, BUG-01) and the WHT base (D-27)
ALTER TABLE public.business_settings
    ADD COLUMN wht_receivable_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN wht_payable_enabled    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN wht_base_key           TEXT NOT NULL DEFAULT 'gross'
        REFERENCES public.wht_bases(key) ON DELETE RESTRICT;
CREATE INDEX idx_business_settings_wht_base ON public.business_settings (wht_base_key);

CREATE OR REPLACE FUNCTION public.business_settings_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_free text[] := ARRAY['version', 'updated_at'];
    v_sales text[] := ARRAY['credit_limit_policy_key', 'wht_receivable_enabled', 'wht_payable_enabled', 'wht_base_key'];
BEGIN
    IF current_user <> 'bookvault_api' THEN
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - v_free - v_sales) IS DISTINCT FROM (to_jsonb(OLD) - v_free - v_sales)
       AND NOT public.has_area_access(NEW.business_id, 'settings.lock_date', 'edit') THEN
        RAISE EXCEPTION 'not allowed to change the book settings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.credit_limit_policy_key, NEW.wht_receivable_enabled, NEW.wht_payable_enabled, NEW.wht_base_key)
       IS DISTINCT FROM (OLD.credit_limit_policy_key, OLD.wht_receivable_enabled, OLD.wht_payable_enabled, OLD.wht_base_key)
       AND NOT public.has_area_access(NEW.business_id, 'settings.business_details', 'edit') THEN
        RAISE EXCEPTION 'not allowed to change the sales settings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_settings_column_guard() FROM PUBLIC, anon, authenticated;

-- 3. Tax codes: reverse charge, several components (PR-18, PR-40)
ALTER TABLE public.tax_codes ADD COLUMN is_reverse_charge BOOLEAN NOT NULL DEFAULT false;
DROP INDEX public.uq_tax_code_components_single;
CREATE INDEX idx_tax_code_components_code ON public.tax_code_components (business_id, tax_code_id, line_no);

-- 4. Line snapshots (BUG-08)
ALTER TABLE public.trade_document_lines ADD COLUMN tax_reverse_charge BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT trade_document_lines_reverse_charge_needs_code
        CHECK (NOT tax_reverse_charge OR tax_code_id IS NOT NULL);

CREATE TABLE public.trade_document_line_taxes (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id  UUID NOT NULL,
    line_id      UUID NOT NULL,
    line_no      INTEGER NOT NULL CHECK (line_no >= 1),
    component_id UUID NOT NULL,
    rate         NUMERIC(9,4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    account_id   UUID NOT NULL,
    CONSTRAINT trade_document_line_taxes_line_no_key UNIQUE (line_id, line_no),
    CONSTRAINT trade_document_line_taxes_line_fkey FOREIGN KEY (business_id, line_id)
        REFERENCES public.trade_document_lines(business_id, id) ON DELETE CASCADE,
    CONSTRAINT trade_document_line_taxes_component_fkey FOREIGN KEY (business_id, component_id)
        REFERENCES public.tax_code_components(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_line_taxes_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_trade_document_line_taxes_line ON public.trade_document_line_taxes (business_id, line_id);
CREATE INDEX idx_trade_document_line_taxes_component ON public.trade_document_line_taxes (business_id, component_id);
CREATE INDEX idx_trade_document_line_taxes_account ON public.trade_document_line_taxes (business_id, account_id);
-- Lines saved before B7 had one component: their snapshot is the line's own rate and account.
INSERT INTO public.trade_document_line_taxes (business_id, line_id, line_no, component_id, rate, account_id)
SELECT l.business_id, l.id, 1, c.id, l.tax_rate, l.tax_account_id
FROM public.trade_document_lines l
JOIN public.tax_code_components c ON c.business_id = l.business_id AND c.tax_code_id = l.tax_code_id
WHERE l.tax_code_id IS NOT NULL;

-- 5. Freight-in (PR-41b)
CREATE TABLE public.trade_document_freight_lines (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL,
    document_id UUID NOT NULL,
    line_no     INTEGER NOT NULL CHECK (line_no >= 1),
    description TEXT NULL CHECK (char_length(description) <= 2000),
    amount      NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    CONSTRAINT trade_document_freight_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT trade_document_freight_lines_line_no_key UNIQUE (document_id, line_no),
    CONSTRAINT trade_document_freight_lines_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.trade_documents(business_id, document_id) ON DELETE RESTRICT
);
CREATE INDEX idx_trade_document_freight_lines_document ON public.trade_document_freight_lines (business_id, document_id);
CREATE TRIGGER trade_document_freight_lines_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.trade_document_freight_lines
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard('description');

-- 6. Withholding tax on a trade document (PR-21, PR-29, PR-41a)
ALTER TABLE public.trade_documents
    ADD COLUMN wht_type_key TEXT NULL REFERENCES public.wht_types(key) ON DELETE RESTRICT,
    ADD COLUMN wht_value    NUMERIC(19,4) NULL CHECK (wht_value > 0),
    ADD CONSTRAINT trade_documents_wht_pair CHECK ((wht_type_key IS NULL) = (wht_value IS NULL)),
    ADD CONSTRAINT trade_documents_wht_rate CHECK (wht_type_key IS DISTINCT FROM 'percentage' OR wht_value <= 100);
CREATE INDEX idx_trade_documents_wht_type ON public.trade_documents (wht_type_key) WHERE wht_type_key IS NOT NULL;

-- 7. Amounts. Line tax is unchanged (one rounded figure per line); a reverse-charge line's tax is
-- self-assessed, not part of the total (PR-40). Totals add freight-in and subtract WHT: WHT =
-- round(rate x base) with base = gross incl. tax, freight and rounding (D-27 default) or the subtotal.
CREATE OR REPLACE VIEW public.trade_document_line_amounts WITH (security_invoker = true) AS
SELECT l.business_id, l.document_id, l.id AS line_id, l.line_no, a.net,
       CASE WHEN l.tax_reverse_charge THEN 0 ELSE a.tax END AS tax,
       CASE WHEN l.tax_reverse_charge THEN a.tax ELSE 0 END AS self_assessed_tax
FROM public.trade_document_lines l
JOIN public.trade_documents td ON td.business_id = l.business_id AND td.document_id = l.document_id
JOIN public.business_currencies bc ON bc.business_id = l.business_id AND bc.is_base
JOIN public.currencies c ON c.id = bc.currency_id
CROSS JOIN LATERAL public.trade_line_amounts(l.qty, l.unit_price, td.discount_type_key, l.discount,
                                             l.tax_rate, td.amounts_include_tax, c.decimal_places) a;

CREATE OR REPLACE VIEW public.trade_document_totals WITH (security_invoker = true) AS
WITH sums AS (
    SELECT td.business_id, td.document_id, td.wht_type_key, td.wht_value,
           COALESCE(sum(a.net), 0) AS line_net, COALESCE(sum(a.tax), 0) AS tax_total
    FROM public.trade_documents td
    LEFT JOIN public.trade_document_line_amounts a ON a.business_id = td.business_id AND a.document_id = td.document_id
    GROUP BY td.business_id, td.document_id
), freight AS (
    SELECT s.*, COALESCE((SELECT sum(f.amount) FROM public.trade_document_freight_lines f
                          WHERE f.business_id = s.business_id AND f.document_id = s.document_id), 0) AS freight
    FROM sums s
), gross AS (
    SELECT f.*, f.line_net + f.freight AS subtotal, f.line_net + f.freight + f.tax_total AS gross
    FROM freight f
), rounded AS (
    SELECT g.*, r.rounding, g.gross + r.rounding AS gross_total
    FROM gross g
    LEFT JOIN public.invoice_terms it ON it.business_id = g.business_id AND it.document_id = g.document_id
    CROSS JOIN LATERAL (SELECT CASE it.rounding_method_key
        WHEN 'nearest' THEN round(g.gross, 0) - g.gross
        WHEN 'down' THEN trunc(g.gross) - g.gross
        ELSE 0 END AS rounding) r
), withheld AS (
    SELECT x.*, CASE x.wht_type_key
        WHEN 'amount' THEN x.wht_value
        WHEN 'percentage' THEN round(CASE bs.wht_base_key WHEN 'net' THEN x.subtotal ELSE x.gross_total END
                                     * x.wht_value / 100, c.decimal_places)
        ELSE 0 END AS withholding_tax
    FROM rounded x
    LEFT JOIN public.business_settings bs ON bs.business_id = x.business_id
    JOIN public.business_currencies bc ON bc.business_id = x.business_id AND bc.is_base
    JOIN public.currencies c ON c.id = bc.currency_id
)
SELECT w.business_id, w.document_id, w.subtotal, w.tax_total, w.rounding, w.gross_total - w.withholding_tax AS total,
       w.freight, w.withholding_tax, w.gross_total
FROM withheld w;

-- 8. Withholding tax receipts (PR-36): the customer's certificate; Dr Withholding tax / Cr WHT receivable[customer]
INSERT INTO public.document_types (key, name) VALUES ('withholding_tax_receipt', 'Withholding tax receipt');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT t.id, 'withholding_tax_receipts' FROM public.document_types t WHERE t.key = 'withholding_tax_receipt';

CREATE TABLE public.withholding_tax_receipts (
    document_id UUID PRIMARY KEY,
    business_id UUID NOT NULL,
    party_id    UUID NOT NULL,
    amount      NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    CONSTRAINT withholding_tax_receipts_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT withholding_tax_receipts_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT withholding_tax_receipts_party_fkey FOREIGN KEY (business_id, party_id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_withholding_tax_receipts_party ON public.withholding_tax_receipts (business_id, party_id);
CREATE TRIGGER withholding_tax_receipts_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.withholding_tax_receipts
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();

UPDATE public.admin_tabs SET default_enabled = true WHERE key = 'withholding-tax-receipts';

-- 9. RLS and grants
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['wht_types', 'wht_bases', 'trade_document_line_taxes', 'trade_document_freight_lines',
                             'withholding_tax_receipts'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
                       t || '_service_role_all', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['wht_types', 'wht_bases'] LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO bookvault_api, bookvault_rls_owner', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING (true)', t || '_api_select', t);
    END LOOP;
    -- Typed children of a document inherit its area (B0.4 shared-ledger pattern).
    FOREACH t IN ARRAY ARRAY['trade_document_freight_lines', 'withholding_tax_receipts'] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING ('
            'public.is_business_member(business_id) AND (public.has_area_access(business_id, '
            'public.document_area_key(business_id, document_id), ''view'') '
            'OR public.has_area_access(business_id, ''reports'', ''view'')))', t || '_api_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO bookvault_api WITH CHECK ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO bookvault_api USING ('
            'public.has_area_write_access(business_id, public.document_area_key(business_id, document_id))) '
            'WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)))',
            t || '_api_update', t);
    END LOOP;
END
$$;
GRANT SELECT, INSERT, UPDATE ON public.withholding_tax_receipts TO bookvault_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_document_freight_lines TO bookvault_api;
CREATE POLICY trade_document_freight_lines_api_delete ON public.trade_document_freight_lines FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));

-- Component snapshots follow their line (readable / writable with it).
GRANT SELECT, INSERT, DELETE ON public.trade_document_line_taxes TO bookvault_api;
CREATE POLICY trade_document_line_taxes_api_select ON public.trade_document_line_taxes FOR SELECT TO bookvault_api
    USING (EXISTS (SELECT 1 FROM public.trade_document_lines l
                   WHERE l.business_id = trade_document_line_taxes.business_id AND l.id = trade_document_line_taxes.line_id));
CREATE POLICY trade_document_line_taxes_api_insert ON public.trade_document_line_taxes FOR INSERT TO bookvault_api
    WITH CHECK (EXISTS (SELECT 1 FROM public.trade_document_lines l
                        WHERE l.business_id = trade_document_line_taxes.business_id AND l.id = trade_document_line_taxes.line_id
                          AND public.has_area_write_access(l.business_id, public.document_area_key(l.business_id, l.document_id))));
CREATE POLICY trade_document_line_taxes_api_delete ON public.trade_document_line_taxes FOR DELETE TO bookvault_api
    USING (EXISTS (SELECT 1 FROM public.trade_document_lines l
                   WHERE l.business_id = trade_document_line_taxes.business_id AND l.id = trade_document_line_taxes.line_id
                     AND public.has_area_write_access(l.business_id, public.document_area_key(l.business_id, l.document_id))));

GRANT SELECT ON public.trade_document_line_taxes, public.trade_document_freight_lines, public.withholding_tax_receipts,
    public.business_settings, public.business_currencies, public.currencies TO bookvault_rls_owner;

-- Customers are picked on withholding tax receipts.
DROP POLICY customers_api_select ON public.customers;
CREATE POLICY customers_api_select ON public.customers FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'customers', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'delivery_notes', 'view')
                OR public.has_area_access(business_id, 'late_payment_fees', 'view')
                OR public.has_area_access(business_id, 'withholding_tax_receipts', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));

-- 10. Purge and export cover the new tables (children first)
GRANT SELECT, DELETE ON public.trade_document_line_taxes, public.trade_document_freight_lines,
    public.withholding_tax_receipts TO bookvault_purge;
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
        'stock_documents', 'withholding_tax_receipts', 'late_payment_fees', 'invoice_terms',
        'trade_document_line_taxes', 'trade_document_lines', 'trade_document_freight_lines', 'trade_documents',
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
