-- ==============================================
-- Migration: customers and sales on the AR sub-ledger (B4; domain-model §1a, §5.2, §5.4, §6;
-- posting-rules PR-15..PR-22, PR-25, PR-29..PR-31, PR-37, PR-61, PR-64; BUG-05, BUG-07, BUG-08; D-05, D-36)
-- Date: 2026-11-08
--
-- * Reference: credit_limit_policies (warn, block), invoice_rounding_methods (none, nearest, down),
--   discount_types (percentage, amount), item_kinds (non_inventory now; inventory, kit in B6),
--   document_link_types; business_settings.credit_limit_policy_key (default warn; a column guard
--   lets settings.business_details editors change only this column, settings.lock_date editors
--   only the book columns).
-- * customers (party extension) gain credit limit, default due days, hourly rate, currency
--   placeholder (NULL = base, B8), division placeholder (B15), is_inactive.
-- * tax_codes + tax_code_components (one component until B7; component account required).
-- * items (kind non_inventory now; income account required, no Suspense default).
-- * trade_documents + trade_document_lines + invoice_terms for sales quotes, orders, invoices,
--   credit notes and delivery notes; late_payment_fees; document_links. Lines snapshot the tax rate
--   and tax account they were saved with (BUG-08); amounts are never stored: trade_line_amounts()
--   and the views trade_document_line_amounts / trade_document_totals compute them (half away from
--   zero per line, PR-16; document rounding PR-20).
-- * payment_allocations gain early_discount (PR-22) and DELETE (repost / void of the settling document).
-- * opening_balances kind sales_invoice: invoice_document_id + paid_before_start (PR-61, D-36).
-- * journal_lines / document_lines FKs for item_id, tax_code_id, tax_component_id (NOT VALID ->
--   VALIDATE, domain-model §3.5); cash_transaction_lines item_id / tax_code_id FKs (B3 placeholder).
-- * Definer aggregates (B0.4 rule, totals only): invoice_balances, invoice_applications,
--   customer_summaries, tax_code_in_use, item_in_use; party_in_use covers trade documents.
-- * Areas non_inventory_items, settings.tax_codes; document types and their areas; sales tabs on
--   by default; purge / export cover the new tables.
--
-- ROLLBACK (run manually, newest first):
--   DROP FUNCTION public.invoice_balances(uuid, uuid[], uuid), public.invoice_applications(uuid, uuid),
--     public.customer_summaries(uuid), public.tax_code_in_use(uuid, uuid), public.item_in_use(uuid, uuid),
--     public.business_settings_column_guard(), public.trade_line_amounts(numeric, numeric, text, numeric,
--     numeric, boolean, integer);
--   DROP VIEW public.trade_document_totals, public.trade_document_line_amounts;
--   DROP TABLE public.document_links, public.late_payment_fees, public.invoice_terms,
--     public.trade_document_lines, public.trade_documents, public.items, public.tax_code_components,
--     public.tax_codes, public.document_link_types, public.item_kinds, public.discount_types,
--     public.invoice_rounding_methods;
--   journal_lines / document_lines / cash_transaction_lines: DROP the item/tax FKs and indexes, re-add
--     the *_unused CHECKs; payment_allocations DROP COLUMN early_discount + its DELETE policy/grant;
--   opening_balances DROP COLUMN invoice_document_id, paid_before_start (restore CHECK and
--     opening_balances_one_live() from 20261108000031); DELETE kind sales_invoice;
--   ALTER TABLE public.business_settings DROP COLUMN credit_limit_policy_key; DROP TABLE public.credit_limit_policies;
--   ALTER TABLE public.customers DROP COLUMN credit_limit, default_due_days, default_hourly_rate,
--     currency_id, division_id, is_inactive;
--   DELETE the B4 document_type_areas, document_types, areas rows; restore party_in_use(),
--   business_scoped_tables() and the select policies from 20261108000031 / 20261108000033.
-- ==============================================

BEGIN;

-- 1. Reference data
CREATE TABLE public.credit_limit_policies (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.credit_limit_policies (key, name) VALUES
    ('warn', 'Warn and ask for confirmation'), ('block', 'Block the invoice');

CREATE TABLE public.invoice_rounding_methods (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.invoice_rounding_methods (key, name) VALUES
    ('none', 'None'), ('nearest', 'Round to nearest'), ('down', 'Round down');

CREATE TABLE public.discount_types (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.discount_types (key, name) VALUES ('percentage', 'Percentage'), ('amount', 'Exact amount');

CREATE TABLE public.item_kinds (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.item_kinds (key, name) VALUES
    ('non_inventory', 'Non-inventory item'), ('inventory', 'Inventory item'), ('kit', 'Inventory kit');

CREATE TABLE public.document_link_types (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
INSERT INTO public.document_link_types (key, name) VALUES
    ('quote_to_order', 'Sales quote to sales order'),
    ('quote_to_invoice', 'Sales quote to sales invoice'),
    ('order_to_invoice', 'Sales order to sales invoice'),
    ('order_to_delivery', 'Sales order to delivery note'),
    ('invoice_to_credit_note', 'Sales invoice to credit note');

-- 2. Business setting: credit limit policy (BUG-05)
ALTER TABLE public.business_settings
    ADD COLUMN credit_limit_policy_key TEXT NOT NULL DEFAULT 'warn'
        REFERENCES public.credit_limit_policies(key) ON DELETE RESTRICT;
CREATE INDEX idx_business_settings_credit_limit_policy ON public.business_settings (credit_limit_policy_key);

-- Which right may change which column (the UPDATE policy admits either right).
CREATE OR REPLACE FUNCTION public.business_settings_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_free text[] := ARRAY['version', 'updated_at'];
    v_sales text[] := ARRAY['credit_limit_policy_key'];
BEGIN
    IF current_user <> 'bookvault_api' THEN
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - v_free - v_sales) IS DISTINCT FROM (to_jsonb(OLD) - v_free - v_sales)
       AND NOT public.has_area_access(NEW.business_id, 'settings.lock_date', 'edit') THEN
        RAISE EXCEPTION 'not allowed to change the book settings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.credit_limit_policy_key IS DISTINCT FROM OLD.credit_limit_policy_key
       AND NOT public.has_area_access(NEW.business_id, 'settings.business_details', 'edit') THEN
        RAISE EXCEPTION 'not allowed to change the sales settings' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.business_settings_column_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER business_settings_column_guard BEFORE UPDATE ON public.business_settings
    FOR EACH ROW EXECUTE FUNCTION public.business_settings_column_guard();
DROP POLICY business_settings_api_update ON public.business_settings;
CREATE POLICY business_settings_api_update ON public.business_settings FOR UPDATE TO bookvault_api
    USING (public.has_area_access(business_id, 'settings.lock_date', 'edit')
           OR public.has_area_access(business_id, 'settings.business_details', 'edit'))
    WITH CHECK (public.has_area_access(business_id, 'settings.lock_date', 'edit')
                OR public.has_area_access(business_id, 'settings.business_details', 'edit'));

-- 3. Customers (party extension, NA-10)
ALTER TABLE public.customers
    ADD COLUMN credit_limit        NUMERIC(19,4) NULL CHECK (credit_limit >= 0),
    ADD COLUMN default_due_days    INTEGER NULL CHECK (default_due_days BETWEEN 0 AND 3650),
    ADD COLUMN default_hourly_rate NUMERIC(19,4) NULL CHECK (default_hourly_rate >= 0),
    ADD COLUMN currency_id         UUID NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    ADD COLUMN division_id         UUID NULL CONSTRAINT customers_division_id_unused CHECK (division_id IS NULL),
    ADD COLUMN is_inactive         BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_customers_currency_id ON public.customers (currency_id) WHERE currency_id IS NOT NULL;
CREATE INDEX idx_customers_business_name ON public.customers (business_id, name);

-- 4. Areas and document types
INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT v.key, v.label, m.id, NULL, false, false, v.sort_order
FROM (VALUES
    ('non_inventory_items', 'Non-inventory items', 'inventory', 76),
    ('settings.tax_codes', 'Tax codes', 'settings', 126)
) AS v(key, label, module_key, sort_order)
JOIN public.modules m ON m.key = v.module_key
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.area_key, r.right_key
FROM public.access_presets p
CROSS JOIN (VALUES ('non_inventory_items'), ('settings.tax_codes')) AS a(area_key)
JOIN LATERAL (VALUES ('view'), ('create'), ('edit'), ('delete')) AS r(right_key)
    ON p.key = 'accountant' OR (p.key = 'view_only' AND r.right_key = 'view')
       OR (p.key = 'bookkeeper' AND a.area_key = 'non_inventory_items' AND r.right_key <> 'delete')
ON CONFLICT DO NOTHING;

INSERT INTO public.document_types (key, name) VALUES
    ('sales_quote', 'Sales quote'), ('sales_order', 'Sales order'), ('sales_invoice', 'Sales invoice'),
    ('credit_note', 'Credit note'), ('delivery_note', 'Delivery note'), ('late_payment_fee', 'Late payment fee');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT t.id, v.area_key
FROM (VALUES ('sales_quote', 'sales_quotes'), ('sales_order', 'sales_orders'),
             ('sales_invoice', 'sales_invoices'), ('credit_note', 'credit_notes'),
             ('delivery_note', 'delivery_notes'), ('late_payment_fee', 'late_payment_fees')) AS v(type_key, area_key)
JOIN public.document_types t ON t.key = v.type_key;

INSERT INTO public.opening_balance_kinds (key, name) VALUES ('sales_invoice', 'Starting-balance sales invoice');

-- 5. Tax codes (single rate until B7, D-05)
CREATE TABLE public.tax_codes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    code        TEXT NULL CHECK (char_length(code) BETWEEN 1 AND 50),
    is_inactive BOOLEAN NOT NULL DEFAULT false,
    version     INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tax_codes_business_id_id_key UNIQUE (business_id, id)
);
CREATE UNIQUE INDEX uq_tax_codes_name ON public.tax_codes (business_id, lower(name));
CREATE UNIQUE INDEX uq_tax_codes_code ON public.tax_codes (business_id, code) WHERE code IS NOT NULL;
CREATE TRIGGER set_updated_at_tax_codes BEFORE UPDATE ON public.tax_codes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.tax_code_components (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id UUID NOT NULL,
    tax_code_id UUID NOT NULL,
    line_no     INTEGER NOT NULL DEFAULT 1 CHECK (line_no >= 1),
    name        TEXT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    rate        NUMERIC(9,4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    account_id  UUID NOT NULL,
    CONSTRAINT tax_code_components_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT tax_code_components_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE CASCADE,
    CONSTRAINT tax_code_components_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT tax_code_components_line_no_key UNIQUE (tax_code_id, line_no)
);
-- One component per code until B7 (multi-rate) drops this index.
CREATE UNIQUE INDEX uq_tax_code_components_single ON public.tax_code_components (business_id, tax_code_id);
CREATE INDEX idx_tax_code_components_account ON public.tax_code_components (business_id, account_id);

-- 6. Items (non-inventory now; inventory_items + kit_components in B6)
CREATE TABLE public.items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    item_kind_key       TEXT NOT NULL REFERENCES public.item_kinds(key) ON DELETE RESTRICT,
    code                TEXT NULL CHECK (char_length(code) BETWEEN 1 AND 50),
    name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    unit_name           TEXT NULL CHECK (char_length(unit_name) BETWEEN 1 AND 50),
    description         TEXT NULL CHECK (char_length(description) <= 2000),
    sales_unit_price    NUMERIC(19,4) NULL,
    purchase_unit_price NUMERIC(19,4) NULL,
    income_account_id   UUID NULL,
    expense_account_id  UUID NULL,
    tax_code_id         UUID NULL,
    is_inactive         BOOLEAN NOT NULL DEFAULT false,
    version             INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT items_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT items_income_account_fkey FOREIGN KEY (business_id, income_account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT items_expense_account_fkey FOREIGN KEY (business_id, expense_account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT items_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE RESTRICT,
    -- PR-25 BV: a non-inventory item names the account it posts to (no Suspense default).
    CONSTRAINT items_non_inventory_income_account
        CHECK (item_kind_key <> 'non_inventory' OR income_account_id IS NOT NULL)
);
CREATE UNIQUE INDEX uq_items_code ON public.items (business_id, code) WHERE code IS NOT NULL;
CREATE INDEX idx_items_business_kind ON public.items (business_id, item_kind_key, name);
CREATE INDEX idx_items_item_kind_key ON public.items (item_kind_key);
CREATE INDEX idx_items_income_account ON public.items (business_id, income_account_id) WHERE income_account_id IS NOT NULL;
CREATE INDEX idx_items_expense_account ON public.items (business_id, expense_account_id) WHERE expense_account_id IS NOT NULL;
CREATE INDEX idx_items_tax_code ON public.items (business_id, tax_code_id) WHERE tax_code_id IS NOT NULL;
CREATE TRIGGER set_updated_at_items BEFORE UPDATE ON public.items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. Trade documents (one design for every party document, §1a)
CREATE TABLE public.trade_documents (
    document_id         UUID PRIMARY KEY,
    business_id         UUID NOT NULL,
    party_id            UUID NOT NULL,
    billing_address     TEXT NULL CHECK (char_length(billing_address) <= 2000),
    delivery_address    TEXT NULL CHECK (char_length(delivery_address) <= 2000),
    amounts_include_tax BOOLEAN NOT NULL DEFAULT false,
    discount_type_key   TEXT NULL REFERENCES public.discount_types(key) ON DELETE RESTRICT,
    expiry_date         DATE NULL,  -- quotes only (service rule)
    CONSTRAINT trade_documents_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT trade_documents_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_documents_party_fkey FOREIGN KEY (business_id, party_id)
        REFERENCES public.parties(business_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_trade_documents_party ON public.trade_documents (business_id, party_id);
CREATE INDEX idx_trade_documents_discount_type ON public.trade_documents (discount_type_key)
    WHERE discount_type_key IS NOT NULL;

CREATE TABLE public.trade_document_lines (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id    UUID NOT NULL,
    document_id    UUID NOT NULL,
    line_no        INTEGER NOT NULL CHECK (line_no >= 1),
    item_id        UUID NULL,
    account_id     UUID NULL,  -- required on posting types (service); quotes, orders, delivery notes may omit it
    description    TEXT NULL CHECK (char_length(description) <= 2000),
    qty            NUMERIC(19,4) NULL CHECK (qty > 0),
    unit_price     NUMERIC(19,4) NOT NULL DEFAULT 0,
    discount       NUMERIC(19,4) NULL CHECK (discount >= 0),  -- percent or amount per trade_documents.discount_type_key
    tax_code_id    UUID NULL,
    tax_rate       NUMERIC(9,4) NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),  -- snapshot (BUG-08)
    tax_account_id UUID NULL,                                                  -- snapshot (BUG-08)
    project_id     UUID NULL CONSTRAINT trade_document_lines_project_id_unused CHECK (project_id IS NULL),
    division_id    UUID NULL CONSTRAINT trade_document_lines_division_id_unused CHECK (division_id IS NULL),
    CONSTRAINT trade_document_lines_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT trade_document_lines_document_line_no_key UNIQUE (document_id, line_no),
    CONSTRAINT trade_document_lines_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.trade_documents(business_id, document_id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_lines_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.items(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_lines_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_lines_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_lines_tax_account_fkey FOREIGN KEY (business_id, tax_account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT trade_document_lines_tax_snapshot
        CHECK ((tax_code_id IS NULL) = (tax_rate IS NULL) AND (tax_code_id IS NULL) = (tax_account_id IS NULL))
);
CREATE INDEX idx_trade_document_lines_document ON public.trade_document_lines (business_id, document_id);
CREATE INDEX idx_trade_document_lines_item ON public.trade_document_lines (business_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX idx_trade_document_lines_account ON public.trade_document_lines (business_id, account_id)
    WHERE account_id IS NOT NULL;
CREATE INDEX idx_trade_document_lines_tax_code ON public.trade_document_lines (business_id, tax_code_id)
    WHERE tax_code_id IS NOT NULL;
CREATE INDEX idx_trade_document_lines_tax_account ON public.trade_document_lines (business_id, tax_account_id)
    WHERE tax_account_id IS NOT NULL;

CREATE TABLE public.invoice_terms (
    document_id          UUID PRIMARY KEY,
    business_id          UUID NOT NULL,
    due_date             DATE NOT NULL,
    rounding_method_key  TEXT NOT NULL DEFAULT 'none' REFERENCES public.invoice_rounding_methods(key) ON DELETE RESTRICT,
    early_discount_rate  NUMERIC(9,4) NULL CHECK (early_discount_rate > 0 AND early_discount_rate < 100),
    early_discount_days  INTEGER NULL CHECK (early_discount_days BETWEEN 0 AND 3650),
    late_fee_rate        NUMERIC(9,4) NULL CHECK (late_fee_rate > 0 AND late_fee_rate <= 100),  -- monthly percent
    is_starting_balance  BOOLEAN NOT NULL DEFAULT false,  -- PR-61 / D-36: set explicitly, never inferred
    is_closed            BOOLEAN NOT NULL DEFAULT false,  -- purchase invoices (B5)
    CONSTRAINT invoice_terms_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT invoice_terms_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.trade_documents(business_id, document_id) ON DELETE RESTRICT,
    CONSTRAINT invoice_terms_early_discount_pair CHECK ((early_discount_rate IS NULL) = (early_discount_days IS NULL))
);
CREATE INDEX idx_invoice_terms_rounding_method ON public.invoice_terms (rounding_method_key);
CREATE INDEX idx_invoice_terms_due_date ON public.invoice_terms (business_id, due_date);

-- PR-31: the fee's customer is the invoice's customer (no copy here, 3NF).
CREATE TABLE public.late_payment_fees (
    document_id         UUID PRIMARY KEY,
    business_id         UUID NOT NULL,
    invoice_document_id UUID NOT NULL,
    amount              NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    CONSTRAINT late_payment_fees_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT late_payment_fees_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT late_payment_fees_invoice_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.invoice_terms(business_id, document_id) ON DELETE RESTRICT
);
CREATE INDEX idx_late_payment_fees_invoice ON public.late_payment_fees (business_id, invoice_document_id);

CREATE TABLE public.document_links (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    business_id      UUID NOT NULL,
    from_document_id UUID NOT NULL,
    to_document_id   UUID NOT NULL,
    link_type_key    TEXT NOT NULL REFERENCES public.document_link_types(key) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT document_links_business_id_id_key UNIQUE (business_id, id),
    CONSTRAINT document_links_from_fkey FOREIGN KEY (business_id, from_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_to_fkey FOREIGN KEY (business_id, to_document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT document_links_not_self CHECK (from_document_id <> to_document_id),
    CONSTRAINT document_links_pair_key UNIQUE (business_id, from_document_id, to_document_id)
);
CREATE INDEX idx_document_links_to ON public.document_links (business_id, to_document_id);
CREATE INDEX idx_document_links_type ON public.document_links (link_type_key);

-- 8. Allocations: early-payment discount (PR-22) and removal on repost / void
ALTER TABLE public.payment_allocations
    ADD COLUMN early_discount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (early_discount >= 0);

-- 9. Starting-balance invoices (PR-61, D-36)
ALTER TABLE public.opening_balances
    ADD COLUMN invoice_document_id UUID NULL,
    ADD COLUMN paid_before_start   NUMERIC(19,4) NULL CHECK (paid_before_start >= 0),
    ADD CONSTRAINT opening_balances_invoice_fkey FOREIGN KEY (business_id, invoice_document_id)
        REFERENCES public.invoice_terms(business_id, document_id) ON DELETE RESTRICT,
    DROP CONSTRAINT opening_balances_source_matches_kind,
    ADD CONSTRAINT opening_balances_source_matches_kind CHECK (
        (kind_key = 'account') = (account_id IS NOT NULL)
        AND (kind_key = 'bank_account') = (bank_account_id IS NOT NULL)
        AND (kind_key = 'sales_invoice') = (invoice_document_id IS NOT NULL)
        AND (kind_key = 'sales_invoice') = (paid_before_start IS NOT NULL));
CREATE INDEX idx_opening_balances_business_invoice ON public.opening_balances (business_id, invoice_document_id)
    WHERE invoice_document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.opening_balances_one_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(
        NEW.business_id::text || ':' || COALESCE(NEW.account_id, NEW.bank_account_id, NEW.invoice_document_id)::text, 0));
    IF EXISTS (
        SELECT 1 FROM public.opening_balances o
        JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
        JOIN public.document_statuses s ON s.id = d.status_id
        WHERE o.business_id = NEW.business_id
          AND o.account_id IS NOT DISTINCT FROM NEW.account_id
          AND o.bank_account_id IS NOT DISTINCT FROM NEW.bank_account_id
          AND o.invoice_document_id IS NOT DISTINCT FROM NEW.invoice_document_id
          AND o.document_id <> NEW.document_id AND s.key <> 'void'
    ) THEN
        RAISE EXCEPTION 'This record already has a starting balance' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- 10. Ledger dimension FKs (domain-model §3.5 staging)
ALTER TABLE public.journal_lines DROP CONSTRAINT journal_lines_item_id_unused,
    DROP CONSTRAINT journal_lines_tax_code_id_unused, DROP CONSTRAINT journal_lines_tax_component_id_unused;
ALTER TABLE public.journal_lines
    ADD CONSTRAINT journal_lines_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.items(business_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT journal_lines_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT journal_lines_tax_component_fkey FOREIGN KEY (business_id, tax_component_id)
        REFERENCES public.tax_code_components(business_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.journal_lines VALIDATE CONSTRAINT journal_lines_item_fkey;
ALTER TABLE public.journal_lines VALIDATE CONSTRAINT journal_lines_tax_code_fkey;
ALTER TABLE public.journal_lines VALIDATE CONSTRAINT journal_lines_tax_component_fkey;
CREATE INDEX idx_journal_lines_item ON public.journal_lines (business_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX idx_journal_lines_tax_code ON public.journal_lines (business_id, tax_code_id) WHERE tax_code_id IS NOT NULL;
CREATE INDEX idx_journal_lines_tax_component ON public.journal_lines (business_id, tax_component_id)
    WHERE tax_component_id IS NOT NULL;

ALTER TABLE public.document_lines DROP CONSTRAINT document_lines_item_id_unused,
    DROP CONSTRAINT document_lines_tax_code_id_unused, DROP CONSTRAINT document_lines_tax_component_id_unused;
ALTER TABLE public.document_lines
    ADD CONSTRAINT document_lines_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.items(business_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT document_lines_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT document_lines_tax_component_fkey FOREIGN KEY (business_id, tax_component_id)
        REFERENCES public.tax_code_components(business_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_document_lines_item ON public.document_lines (business_id, item_id) WHERE item_id IS NOT NULL;
CREATE INDEX idx_document_lines_tax_code ON public.document_lines (business_id, tax_code_id) WHERE tax_code_id IS NOT NULL;
CREATE INDEX idx_document_lines_tax_component ON public.document_lines (business_id, tax_component_id)
    WHERE tax_component_id IS NOT NULL;

ALTER TABLE public.cash_transaction_lines DROP CONSTRAINT cash_transaction_lines_item_id_unused,
    DROP CONSTRAINT cash_transaction_lines_tax_code_id_unused;
ALTER TABLE public.cash_transaction_lines
    ADD CONSTRAINT cash_transaction_lines_item_fkey FOREIGN KEY (business_id, item_id)
        REFERENCES public.items(business_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT cash_transaction_lines_tax_code_fkey FOREIGN KEY (business_id, tax_code_id)
        REFERENCES public.tax_codes(business_id, id) ON DELETE RESTRICT;
CREATE INDEX idx_cash_transaction_lines_item ON public.cash_transaction_lines (business_id, item_id)
    WHERE item_id IS NOT NULL;
CREATE INDEX idx_cash_transaction_lines_tax_code ON public.cash_transaction_lines (business_id, tax_code_id)
    WHERE tax_code_id IS NOT NULL;

-- 11. Lock date on the typed child rows (PR-75; line descriptions stay editable)
CREATE TRIGGER trade_documents_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.trade_documents
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();
CREATE TRIGGER trade_document_lines_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.trade_document_lines
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard('description');
CREATE TRIGGER invoice_terms_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_terms
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();
CREATE TRIGGER late_payment_fees_lock_date
    BEFORE INSERT OR UPDATE OR DELETE ON public.late_payment_fees
    FOR EACH ROW EXECUTE FUNCTION public.document_child_lock_guard();

-- 12. Amounts (the one implementation; the posting service reads it after storing the lines)
-- Line: base = round(qty x price); gross = base - discount; exclusive tax = round(gross x rate / 100),
-- inclusive tax = round(gross x rate / (100 + rate)), net = gross - tax. numeric round() is half
-- away from zero (posting-rules §1, T82).
CREATE OR REPLACE FUNCTION public.trade_line_amounts(
    p_qty numeric, p_unit_price numeric, p_discount_type text, p_discount numeric,
    p_tax_rate numeric, p_inclusive boolean, p_dp integer
)
RETURNS TABLE (net numeric, tax numeric)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    WITH base AS (
        SELECT round(COALESCE(p_qty, 1) * p_unit_price, p_dp) AS amount
    ), gross AS (
        SELECT amount - CASE p_discount_type
            WHEN 'percentage' THEN round(amount * COALESCE(p_discount, 0) / 100, p_dp)
            WHEN 'amount' THEN round(COALESCE(p_discount, 0), p_dp)
            ELSE 0 END AS amount
        FROM base
    ), taxed AS (
        SELECT amount, CASE
            WHEN p_tax_rate IS NULL THEN 0
            WHEN p_inclusive THEN round(amount * p_tax_rate / (100 + p_tax_rate), p_dp)
            ELSE round(amount * p_tax_rate / 100, p_dp) END AS tax
        FROM gross
    )
    SELECT CASE WHEN p_inclusive THEN amount - tax ELSE amount END, tax FROM taxed;
$$;

CREATE VIEW public.trade_document_line_amounts WITH (security_invoker = true) AS
SELECT l.business_id, l.document_id, l.id AS line_id, l.line_no, a.net, a.tax
FROM public.trade_document_lines l
JOIN public.trade_documents td ON td.business_id = l.business_id AND td.document_id = l.document_id
JOIN public.business_currencies bc ON bc.business_id = l.business_id AND bc.is_base
JOIN public.currencies c ON c.id = bc.currency_id
CROSS JOIN LATERAL public.trade_line_amounts(l.qty, l.unit_price, td.discount_type_key, l.discount,
                                             l.tax_rate, td.amounts_include_tax, c.decimal_places) a;

-- Document rounding (PR-20): to a whole currency unit, applied to the total, never per line.
CREATE VIEW public.trade_document_totals WITH (security_invoker = true) AS
WITH sums AS (
    SELECT td.business_id, td.document_id,
           COALESCE(sum(a.net), 0) AS subtotal, COALESCE(sum(a.tax), 0) AS tax_total,
           COALESCE(sum(a.net + a.tax), 0) AS gross
    FROM public.trade_documents td
    LEFT JOIN public.trade_document_line_amounts a ON a.business_id = td.business_id AND a.document_id = td.document_id
    GROUP BY td.business_id, td.document_id
)
SELECT s.business_id, s.document_id, s.subtotal, s.tax_total, r.rounding, s.gross + r.rounding AS total
FROM sums s
LEFT JOIN public.invoice_terms it ON it.business_id = s.business_id AND it.document_id = s.document_id
CROSS JOIN LATERAL (SELECT CASE it.rounding_method_key
    WHEN 'nearest' THEN round(s.gross, 0) - s.gross
    WHEN 'down' THEN trunc(s.gross) - s.gross
    ELSE 0 END AS rounding) r;

-- 13. Definer aggregates (B0.4: totals only, the caller's view right checked)
-- Balance due of posted sales invoices = total + late fees - allocations (amount + early discount)
-- from posted settling documents (receipts, credit notes, starting balances); domain-model §5.1.
-- With the invoice's discount and late-fee terms, so a receipt clerk's posting computes the same
-- early-payment discount whatever sales areas they can read.
CREATE OR REPLACE FUNCTION public.invoice_balances(p_business_id uuid, p_ids uuid[], p_party_id uuid)
RETURNS TABLE (invoice_document_id uuid, party_id uuid, document_date date, reference text, due_date date,
               total numeric, fees numeric, applied numeric, balance_due numeric,
               early_discount_rate numeric, early_discount_days integer, late_fee_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.id, td.party_id, d.document_date, d.reference, it.due_date, t.total,
           COALESCE(f.amount, 0), COALESCE(a.amount, 0), t.total + COALESCE(f.amount, 0) - COALESCE(a.amount, 0),
           it.early_discount_rate, it.early_discount_days, it.late_fee_rate
    FROM public.documents d
    JOIN public.document_types ty ON ty.id = d.document_type_id AND ty.key = 'sales_invoice'
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
      AND (public.has_area_access(p_business_id, 'sales_invoices', 'view')
           OR public.has_area_access(p_business_id, 'customers', 'view')
           OR public.has_area_access(p_business_id, 'receipts', 'view')
           OR public.has_area_access(p_business_id, 'credit_notes', 'view')
           OR public.has_area_access(p_business_id, 'late_payment_fees', 'view')
           OR public.has_area_access(p_business_id, 'reports', 'view'));
$$;

-- What settled one invoice (receipts, credit notes, starting balance), for the invoice view.
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
           OR public.has_area_access(p_business_id, 'customers', 'view'))
    ORDER BY sd.document_date, sd.id;
$$;

-- Customers list: AR balance (Accounts receivable lines only), whether the customer has any AR
-- history, and the uninvoiced amount of posted sales orders without a linked invoice.
CREATE OR REPLACE FUNCTION public.customer_summaries(p_business_id uuid)
RETURNS TABLE (party_id uuid, ar_balance numeric, has_history boolean, uninvoiced numeric)
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
    )
    SELECT c.id, COALESCE(ar.balance, 0), ar.party_id IS NOT NULL, COALESCE(o.amount, 0)
    FROM public.customers c
    LEFT JOIN ar ON ar.party_id = c.id
    LEFT JOIN orders o ON o.party_id = c.id
    WHERE c.business_id = p_business_id
      AND public.has_area_access(p_business_id, 'customers', 'view');
$$;

-- Reference checks behind the 409s of master-data deletes (must see every row, whatever RLS shows).
CREATE OR REPLACE FUNCTION public.tax_code_in_use(p_business_id uuid, p_tax_code_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_business_member(p_business_id) AND (
        EXISTS (SELECT 1 FROM public.trade_document_lines WHERE business_id = p_business_id AND tax_code_id = p_tax_code_id)
        OR EXISTS (SELECT 1 FROM public.items WHERE business_id = p_business_id AND tax_code_id = p_tax_code_id)
        OR EXISTS (SELECT 1 FROM public.cash_transaction_lines WHERE business_id = p_business_id AND tax_code_id = p_tax_code_id)
        OR EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND tax_code_id = p_tax_code_id));
$$;

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
        OR EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND item_id = p_item_id));
$$;

-- 14. Privileges and RLS
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['credit_limit_policies', 'invoice_rounding_methods', 'discount_types', 'item_kinds',
                             'document_link_types', 'tax_codes', 'tax_code_components', 'items', 'trade_documents',
                             'trade_document_lines', 'invoice_terms', 'late_payment_fees', 'document_links'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
        EXECUTE format('CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
                       t || '_service_role_all', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['credit_limit_policies', 'invoice_rounding_methods', 'discount_types', 'item_kinds',
                             'document_link_types'] LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO bookvault_api, bookvault_rls_owner', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING (true)', t || '_api_select', t);
    END LOOP;
    -- Typed children of a document inherit its area (B0.4 shared-ledger pattern).
    FOREACH t IN ARRAY ARRAY['trade_documents', 'trade_document_lines', 'invoice_terms', 'late_payment_fees'] LOOP
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

GRANT SELECT, INSERT, UPDATE ON public.trade_documents, public.invoice_terms, public.late_payment_fees TO bookvault_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_document_lines TO bookvault_api;
CREATE POLICY trade_document_lines_api_delete ON public.trade_document_lines FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, document_id)));
-- A document that is never posted to the ledger may be replaced only while it is a draft (service);
-- the typed extensions have no DELETE (void keeps them).

GRANT SELECT, INSERT, DELETE ON public.document_links TO bookvault_api;
CREATE POLICY document_links_api_select ON public.document_links FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, public.document_area_key(business_id, from_document_id), 'view')
                OR public.has_area_access(business_id, public.document_area_key(business_id, to_document_id), 'view')));
CREATE POLICY document_links_api_insert ON public.document_links FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, public.document_area_key(business_id, to_document_id)));
-- A credit note re-linked to another invoice drops its old link (the link belongs to the target).
CREATE POLICY document_links_api_delete ON public.document_links FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, to_document_id)));

-- Allocations are replaced when their settling document is reposted or voided (PR-64).
GRANT DELETE ON public.payment_allocations TO bookvault_api;
CREATE POLICY payment_allocations_api_delete ON public.payment_allocations FOR DELETE TO bookvault_api
    USING (public.has_area_write_access(business_id, public.document_area_key(business_id, settling_document_id)));

-- Master data: tax codes and items, readable from every form area that picks them.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_codes, public.tax_code_components, public.items TO bookvault_api;
GRANT SELECT ON public.tax_codes, public.tax_code_components, public.items TO bookvault_rls_owner;
CREATE POLICY tax_codes_api_select ON public.tax_codes FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.tax_codes', 'view')
                OR public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'receipts', 'view')
                OR public.has_area_access(business_id, 'payments', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY tax_code_components_api_select ON public.tax_code_components FOR SELECT TO bookvault_api
    USING (EXISTS (SELECT 1 FROM public.tax_codes c
                   WHERE c.business_id = tax_code_components.business_id AND c.id = tax_code_components.tax_code_id));
CREATE POLICY items_api_select ON public.items FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'sales_quotes', 'view')
                OR public.has_area_access(business_id, 'sales_orders', 'view')
                OR public.has_area_access(business_id, 'sales_invoices', 'view')
                OR public.has_area_access(business_id, 'credit_notes', 'view')
                OR public.has_area_access(business_id, 'delivery_notes', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
DO $$
DECLARE
    v record;
BEGIN
    FOR v IN SELECT * FROM (VALUES ('tax_codes', 'settings.tax_codes'), ('tax_code_components', 'settings.tax_codes'),
                                   ('items', 'non_inventory_items')) AS x(t, area) LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO bookvault_api WITH CHECK ('
                       'public.has_area_access(business_id, %L, ''create'') OR public.has_area_access(business_id, %L, ''edit''))',
                       v.t || '_api_insert', v.t, v.area, v.area);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO bookvault_api USING ('
                       'public.has_area_access(business_id, %L, ''edit'')) WITH CHECK ('
                       'public.has_area_access(business_id, %L, ''edit''))', v.t || '_api_update', v.t, v.area, v.area);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO bookvault_api USING ('
                       'public.has_area_access(business_id, %L, ''delete'') OR public.has_area_access(business_id, %L, ''edit''))',
                       v.t || '_api_delete', v.t, v.area, v.area);
    END LOOP;
END
$$;

-- Form pickers: accounts and customers are readable from the sales areas.
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
                OR public.has_area_access(business_id, 'settings.tax_codes', 'view')
                OR public.has_area_access(business_id, 'non_inventory_items', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
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
                OR public.has_area_access(business_id, 'reports', 'view')));

GRANT SELECT ON public.trade_documents, public.trade_document_lines, public.invoice_terms, public.late_payment_fees,
    public.document_links, public.payment_allocations, public.trade_document_line_amounts,
    public.trade_document_totals, public.business_currencies, public.currencies, public.documents,
    public.document_types, public.document_statuses, public.journal_lines, public.customers
    TO bookvault_rls_owner;
GRANT SELECT ON public.trade_document_line_amounts, public.trade_document_totals TO bookvault_api;

REVOKE EXECUTE ON FUNCTION public.invoice_balances(uuid, uuid[], uuid), public.invoice_applications(uuid, uuid),
    public.customer_summaries(uuid), public.tax_code_in_use(uuid, uuid), public.item_in_use(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_balances(uuid, uuid[], uuid), public.invoice_applications(uuid, uuid),
    public.customer_summaries(uuid), public.tax_code_in_use(uuid, uuid), public.item_in_use(uuid, uuid)
    TO bookvault_api;
GRANT EXECUTE ON FUNCTION public.trade_line_amounts(numeric, numeric, text, numeric, numeric, boolean, integer)
    TO bookvault_api, bookvault_rls_owner;
GRANT CREATE ON SCHEMA public TO bookvault_rls_owner;
ALTER FUNCTION public.invoice_balances(uuid, uuid[], uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.invoice_applications(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.customer_summaries(uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.tax_code_in_use(uuid, uuid) OWNER TO bookvault_rls_owner;
ALTER FUNCTION public.item_in_use(uuid, uuid) OWNER TO bookvault_rls_owner;
-- party_in_use() is owned by bookvault_rls_owner (20261108000031): replace it as that role.
SET ROLE bookvault_rls_owner;
CREATE OR REPLACE FUNCTION public.party_in_use(p_business_id uuid, p_party_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_business_member(p_business_id) AND (
        EXISTS (SELECT 1 FROM public.journal_lines WHERE business_id = p_business_id AND party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.document_lines WHERE business_id = p_business_id AND party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.cash_transactions WHERE business_id = p_business_id
                   AND counterparty_party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.cash_transaction_lines WHERE business_id = p_business_id
                   AND party_id = p_party_id)
        OR EXISTS (SELECT 1 FROM public.trade_documents WHERE business_id = p_business_id AND party_id = p_party_id));
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_rls_owner;

-- 15. Sales tabs on by default for new businesses (build-plan B4)
UPDATE public.admin_tabs SET default_enabled = true
WHERE key IN ('customers', 'sales-quotes', 'sales-orders', 'sales-invoices', 'credit-notes',
              'late-payment-fees', 'delivery-notes');

-- 16. Purge and export cover the new tables (children first)
GRANT SELECT, DELETE ON public.tax_codes, public.tax_code_components, public.items, public.trade_documents,
    public.trade_document_lines, public.invoice_terms, public.late_payment_fees, public.document_links
    TO bookvault_purge;
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
        'late_payment_fees', 'invoice_terms', 'trade_document_lines', 'trade_documents',
        'cash_transaction_lines', 'cash_transactions', 'inter_account_transfers', 'document_lines',
        'documents', 'document_sequences', 'items', 'tax_code_components', 'tax_codes',
        'business_currencies', 'capital_accounts', 'bank_accounts', 'customers', 'suppliers', 'parties',
        'coa_accounts', 'coa_groups', 'business_tab_columns', 'business_tabs', 'business_format',
        'business_details', 'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;

COMMIT;
