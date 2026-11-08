-- ==============================================
-- Migration: chart of accounts on the stored ledger (B2)
-- Date: 2026-11-08
--
-- * Reference data: statement_types, cash_flow_categories, coa_root_groups (the 5 fixed
--   roots), system_account_types (posting-rules §2; names come from here, never from code).
-- * coa_groups: root_key (one row per root and business), type -> statement_types FK;
--   is_system / is_orphaned dropped (a root is the system group). Every other group has a parent.
-- * coa_accounts: system_account_type_id (UNIQUE per business), group_id NOT NULL, type ->
--   coa_root_groups(account_type) FK and equal to the group's root (trigger), cash_flow_category
--   -> cash_flow_categories FK; is_system dropped (= system_account_type_id IS NOT NULL);
--   the type 'total' and its "Net Profit (Loss)" rows are gone (P&L totals are computed).
-- * Triggers: no group cycles, panel = parent's panel, account type = root of its group.
-- * Every business is seeded with the 5 roots and every system account (shown when its tab is
--   enabled or it has a balance); a new business also gets its country template (D-28).
-- * Country templates: country_templates (+ groups, accounts), generic + PK seeded.
-- * businesses.country (text) -> country_id FK (matched by name or code; unmatched -> NULL).
-- * Opening balances (D-35): document type opening_balance, area settings.starting_balances,
--   opening_balance_kinds, opening_balances (one live row per source record, trigger).
--
-- Runbook B0.8: pre-check supabase/prechecks/20261108000029_chart_of_accounts.sql (also run as
-- the first DO block below); pg_dump -Fc before applying.
--
-- ROLLBACK (schema; for data restore the pre-migration dump):
--   DROP TRIGGER businesses_seed_chart ON public.businesses; DROP FUNCTION public.businesses_seed_chart();
--   DROP FUNCTION public.apply_country_template(uuid), public.seed_business_chart(uuid);
--   DROP TABLE public.opening_balances, public.opening_balance_kinds;
--   DELETE FROM public.document_type_areas WHERE area_key = 'settings.starting_balances';
--   DELETE FROM public.document_types WHERE key = 'opening_balance';
--   DELETE FROM public.access_preset_rights WHERE area_key = 'settings.starting_balances';
--   DELETE FROM public.areas WHERE key = 'settings.starting_balances';
--   DROP TABLE public.country_template_accounts, public.country_template_groups, public.country_templates;
--   ALTER TABLE public.businesses ADD COLUMN country text; UPDATE ... SET country = countries.name; DROP COLUMN country_id;
--   DROP TRIGGER coa_accounts_check_root ON public.coa_accounts; DROP TRIGGER coa_groups_check_tree ON public.coa_groups;
--   DROP FUNCTION public.coa_accounts_check_root(), public.coa_groups_check_tree(), public.coa_group_root(uuid, uuid);
--   ALTER TABLE public.coa_accounts ADD COLUMN is_system boolean NOT NULL DEFAULT false (set from
--     system_account_type_id), DROP COLUMN system_account_type_id, ALTER group_id DROP NOT NULL,
--     DROP the type / cash-flow FKs, re-add CHECK coa_accounts_type_values;
--   ALTER TABLE public.coa_groups ADD COLUMN is_system, is_orphaned; DROP COLUMN root_key; re-add CHECK;
--   DROP TABLE public.system_account_types, public.coa_root_groups, public.cash_flow_categories,
--     public.statement_types.
-- ==============================================

-- 0. Pre-check (runbook B0.8): the backfill refuses data it cannot place.
DO $$
DECLARE
    v_problems integer;
BEGIN
    WITH RECURSIVE tops(id, business_id, top_id, top_name, top_type, depth, path) AS (
        SELECT g.id, g.business_id, g.id, g.name, g.type, 0, ARRAY[g.id]
        FROM public.coa_groups g WHERE g.parent_group_id IS NULL
        UNION ALL
        SELECT c.id, c.business_id, t.top_id, t.top_name, t.top_type, t.depth + 1, t.path || c.id
        FROM public.coa_groups c JOIN tops t ON c.business_id = t.business_id AND c.parent_group_id = t.id
        WHERE NOT c.id = ANY (t.path) AND t.depth < 64
    ),
    top_types AS (
        SELECT t.top_id, t.top_name, t.top_type, array_agg(DISTINCT a.type) AS types
        FROM tops t JOIN public.coa_accounts a ON a.business_id = t.business_id AND a.group_id = t.id
        GROUP BY 1, 2, 3
    )
    SELECT (SELECT count(*) FROM public.coa_groups g WHERE NOT EXISTS (SELECT 1 FROM tops t WHERE t.id = g.id))
         + (SELECT count(*) FROM public.coa_groups g JOIN tops t ON t.id = g.id WHERE g.type <> t.top_type)
         + (SELECT count(*) FROM top_types WHERE cardinality(types) > 1)
         + (SELECT count(*) FROM top_types
            WHERE lower(top_name) IN ('assets', 'liabilities', 'equity', 'income', 'expenses')
              AND types <> ARRAY[CASE lower(top_name) WHEN 'assets' THEN 'asset' WHEN 'liabilities' THEN 'liability'
                                 WHEN 'equity' THEN 'equity' WHEN 'income' THEN 'income' ELSE 'expense' END])
         + (SELECT count(*) FROM top_types
            WHERE cardinality(types) = 1 AND (top_type = 'pl') <> (types[1] IN ('income', 'expense')))
         + (SELECT count(*) FROM public.coa_accounts a WHERE a.type = 'total' AND (
                EXISTS (SELECT 1 FROM public.journal_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
                OR EXISTS (SELECT 1 FROM public.document_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
                OR EXISTS (SELECT 1 FROM public.receipts r, jsonb_array_elements(r.lines) x
                           WHERE r.business_id = a.business_id AND x->>'account_id' = a.id::text)))
         + (SELECT count(*) FROM public.coa_accounts WHERE cash_flow_category IS NOT NULL
              AND cash_flow_category NOT IN ('operating', 'investing', 'financing', 'cash_equivalent'))
         + (SELECT count(*) FROM (SELECT 1 FROM public.coa_accounts WHERE is_system AND type <> 'total'
                                  GROUP BY business_id, name HAVING count(*) > 1) d)
    INTO v_problems;
    IF v_problems > 0 THEN
        RAISE EXCEPTION 'COA pre-check failed: % problem rows; run supabase/prechecks/20261108000029_chart_of_accounts.sql',
            v_problems;
    END IF;
END $$;

-- 1. Reference data ------------------------------------------------------------------------
CREATE TABLE public.statement_types (
    key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name       TEXT NOT NULL,
    sort_order SMALLINT NOT NULL
);
INSERT INTO public.statement_types (key, name, sort_order) VALUES
    ('balance_sheet', 'Balance sheet', 0),
    ('pl', 'Profit and loss statement', 1);

CREATE TABLE public.cash_flow_categories (
    key        TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name       TEXT NOT NULL,
    sort_order SMALLINT NOT NULL
);
INSERT INTO public.cash_flow_categories (key, name, sort_order) VALUES
    ('operating', 'Operating activities', 0),
    ('investing', 'Investing activities', 1),
    ('financing', 'Financing activities', 2),
    ('cash_equivalent', 'Cash and cash equivalents', 3);

-- The 5 fixed root groups (understanding.md §6.1). account_type is the type of every account
-- under the root; normal_balance is the side its amounts are shown on.
CREATE TABLE public.coa_root_groups (
    key            TEXT PRIMARY KEY CHECK (key ~ '^[a-z]+$'),
    name           TEXT NOT NULL,
    statement_type TEXT NOT NULL REFERENCES public.statement_types(key) ON DELETE RESTRICT,
    account_type   TEXT NOT NULL UNIQUE CHECK (account_type ~ '^[a-z]+$'),
    normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    sort_order     SMALLINT NOT NULL
);
CREATE INDEX idx_coa_root_groups_statement_type ON public.coa_root_groups (statement_type);
INSERT INTO public.coa_root_groups (key, name, statement_type, account_type, normal_balance, sort_order) VALUES
    ('assets',      'Assets',      'balance_sheet', 'asset',     'debit',  0),
    ('liabilities', 'Liabilities', 'balance_sheet', 'liability', 'credit', 1),
    ('equity',      'Equity',      'balance_sheet', 'equity',    'credit', 2),
    ('income',      'Income',      'pl',            'income',    'credit', 3),
    ('expenses',    'Expenses',    'pl',            'expense',   'debit',  4);

-- posting-rules §2. Visible when always_visible, when the account has a balance, or when the
-- tab named by enabled_by_admin_tab_id is enabled for the business.
CREATE TABLE public.system_account_types (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    code                    TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    name                    TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    root_key                TEXT NOT NULL REFERENCES public.coa_root_groups(key) ON DELETE RESTRICT,
    subledger_kind          TEXT NOT NULL DEFAULT 'none' CHECK (subledger_kind IN
        ('none', 'bank_account', 'party', 'item', 'fixed_asset', 'intangible_asset', 'investment', 'billable_time')),
    normal_balance          TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
    enabled_by_admin_tab_id UUID NULL REFERENCES public.admin_tabs(id) ON DELETE SET NULL,
    always_visible          BOOLEAN NOT NULL DEFAULT false,
    sort_order              SMALLINT NOT NULL
);
CREATE INDEX idx_system_account_types_root_key ON public.system_account_types (root_key);
CREATE INDEX idx_system_account_types_tab ON public.system_account_types (enabled_by_admin_tab_id)
    WHERE enabled_by_admin_tab_id IS NOT NULL;

INSERT INTO public.system_account_types
    (code, name, root_key, subledger_kind, normal_balance, enabled_by_admin_tab_id, always_visible, sort_order)
SELECT v.code, v.name, v.root_key, v.subledger_kind, v.normal_balance, t.id, v.always_visible, v.sort_order
FROM (VALUES
    ('suspense',                   'Suspense',                                   'equity',      'none',             'credit', NULL,                       false, 0),
    ('retained_earnings',          'Retained earnings',                          'equity',      'none',             'credit', NULL,                       true,  1),
    ('cash_control',               'Cash & cash equivalents',                    'assets',      'bank_account',     'debit',  'bank-and-cash-accounts',   false, 2),
    ('accounts_receivable',        'Accounts receivable',                        'assets',      'party',            'debit',  'customers',                false, 3),
    ('accounts_payable',           'Accounts payable',                           'liabilities', 'party',            'credit', 'suppliers',                false, 4),
    ('tax_payable',                'Tax payable',                                'liabilities', 'none',             'credit', NULL,                       false, 5),
    ('wht_receivable',             'Withholding tax receivable',                 'assets',      'party',            'debit',  NULL,                       false, 6),
    ('wht_payable',                'Withholding tax payable',                    'liabilities', 'party',            'credit', NULL,                       false, 7),
    ('wht_certificates',           'Withholding tax',                            'assets',      'none',             'debit',  'withholding-tax-receipts', false, 8),
    ('inventory_on_hand',          'Inventory on hand',                          'assets',      'item',             'debit',  'inventory-items',          false, 9),
    ('inventory_sales',            'Inventory - sales',                          'income',      'none',             'credit', 'inventory-items',          false, 10),
    ('inventory_cost',             'Inventory - cost',                           'expenses',    'none',             'debit',  'inventory-items',          false, 11),
    ('inventory_write_offs',       'Inventory write-offs',                       'expenses',    'none',             'debit',  'inventory-write-offs',     false, 12),
    ('rounding',                   'Rounding expense',                           'expenses',    'none',             'debit',  'sales-invoices',           false, 13),
    ('fx_gain_loss',               'Foreign exchange gains (losses)',            'expenses',    'none',             'debit',  NULL,                       false, 14),
    ('late_payment_fees',          'Late payment fees',                          'income',      'none',             'credit', 'late-payment-fees',        false, 15),
    ('billable_time',              'Billable time',                              'assets',      'billable_time',    'debit',  'billable-time',            false, 16),
    ('billable_time_movement',     'Billable time - movement',                   'income',      'none',             'credit', 'billable-time',            false, 17),
    ('billable_time_invoiced',     'Billable time - invoiced',                   'income',      'none',             'credit', 'billable-time',            false, 18),
    ('billable_expenses',          'Billable expenses',                          'assets',      'party',            'debit',  NULL,                       false, 19),
    ('billable_expenses_invoiced', 'Billable expenses - invoiced',               'income',      'none',             'credit', NULL,                       false, 20),
    ('billable_expenses_cost',     'Billable expenses - cost',                   'expenses',    'none',             'debit',  NULL,                       false, 21),
    ('fa_cost',                    'Fixed assets, at cost',                      'assets',      'fixed_asset',      'debit',  'fixed-assets',             false, 22),
    ('fa_accum_depreciation',      'Fixed assets, accumulated depreciation',     'assets',      'fixed_asset',      'credit', 'fixed-assets',             false, 23),
    ('fa_depreciation',            'Fixed assets - depreciation',                'expenses',    'none',             'debit',  'fixed-assets',             false, 24),
    ('fa_disposal_gain_loss',      'Fixed assets - loss on disposal',            'expenses',    'none',             'debit',  'fixed-assets',             false, 25),
    ('ia_cost',                    'Intangible assets, at cost',                 'assets',      'intangible_asset', 'debit',  'intangible-assets',        false, 26),
    ('ia_accum_amortization',      'Intangible assets, accumulated amortization','assets',      'intangible_asset', 'credit', 'intangible-assets',        false, 27),
    ('ia_amortization',            'Intangible assets - amortization',           'expenses',    'none',             'debit',  'intangible-assets',        false, 28),
    ('ia_disposal_gain_loss',      'Intangible assets - loss on disposal',       'expenses',    'none',             'debit',  'intangible-assets',        false, 29),
    ('investments',                'Investments',                                'assets',      'investment',       'debit',  'investments',              false, 30),
    ('investment_gain_loss',       'Investment gains (losses)',                  'income',      'none',             'credit', 'investments',              false, 31),
    ('capital_control',            'Capital accounts',                           'equity',      'party',            'credit', 'capital-accounts',         false, 32),
    ('special_control',            'Special accounts',                           'assets',      'party',            'debit',  'special-accounts',         false, 33),
    ('employee_clearing',          'Employee clearing account',                  'liabilities', 'party',            'credit', 'employees',                false, 34),
    ('expense_claims',             'Expense claims',                             'liabilities', 'party',            'credit', 'expense-claims',           false, 35),
    ('early_payment_discount',     'Early payment discounts',                    'expenses',    'none',             'debit',  NULL,                       false, 36)
) AS v(code, name, root_key, subledger_kind, normal_balance, tab_key, always_visible, sort_order)
LEFT JOIN public.admin_tabs t ON t.key = v.tab_key;

-- 2. coa_groups: roots ---------------------------------------------------------------------
ALTER TABLE public.coa_groups
    ADD COLUMN root_key TEXT NULL REFERENCES public.coa_root_groups(key) ON DELETE RESTRICT;
ALTER TABLE public.coa_groups
    ADD CONSTRAINT coa_groups_business_root_key UNIQUE (business_id, root_key);
CREATE INDEX idx_coa_groups_root_key ON public.coa_groups (root_key) WHERE root_key IS NOT NULL;

-- Existing roots: the system Assets/Liabilities/Equity groups and top-level Income/Expenses.
UPDATE public.coa_groups g SET root_key = r.key
FROM public.coa_root_groups r
WHERE g.parent_group_id IS NULL AND g.type = r.statement_type AND lower(g.name) = lower(r.name)
  AND g.id = (SELECT min(x.id::text)::uuid FROM public.coa_groups x
              WHERE x.business_id = g.business_id AND x.parent_group_id IS NULL
                AND x.type = r.statement_type AND lower(x.name) = lower(r.name));

INSERT INTO public.coa_groups (business_id, name, type, parent_group_id, is_system, sort_order, root_key)
SELECT b.id, r.name, r.statement_type, NULL, true, r.sort_order, r.key
FROM public.businesses b CROSS JOIN public.coa_root_groups r
ON CONFLICT (business_id, root_key) DO NOTHING;

-- Other top-level groups go under the root of their accounts' type (pre-check: one type),
-- empty ones under Assets (balance sheet) or Expenses (P&L).
WITH top_type AS (
    SELECT g.id, g.business_id, g.type,
           (WITH RECURSIVE sub(id) AS (
                SELECT g.id UNION ALL
                SELECT c.id FROM public.coa_groups c JOIN sub ON c.parent_group_id = sub.id
                WHERE c.business_id = g.business_id)
            SELECT min(a.type) FROM public.coa_accounts a JOIN sub ON a.group_id = sub.id
            WHERE a.business_id = g.business_id) AS account_type
    FROM public.coa_groups g
    WHERE g.parent_group_id IS NULL AND g.root_key IS NULL
)
UPDATE public.coa_groups g
SET parent_group_id = root.id
FROM top_type t
JOIN public.coa_root_groups r
  ON r.account_type = COALESCE(t.account_type, CASE t.type WHEN 'pl' THEN 'expense' ELSE 'asset' END)
JOIN public.coa_groups root ON root.business_id = t.business_id AND root.root_key = r.key
WHERE g.id = t.id;

-- 3. coa_accounts: system types, roots ------------------------------------------------------
ALTER TABLE public.coa_accounts
    ADD COLUMN system_account_type_id UUID NULL REFERENCES public.system_account_types(id) ON DELETE RESTRICT;
ALTER TABLE public.coa_accounts
    ADD CONSTRAINT coa_accounts_business_system_type_key UNIQUE (business_id, system_account_type_id);
CREATE INDEX idx_coa_accounts_system_account_type_id ON public.coa_accounts (system_account_type_id)
    WHERE system_account_type_id IS NOT NULL;

-- Unused "Inter Account Transfers" rows (BV-04) and the "total" rows (P&L totals are computed).
DELETE FROM public.coa_accounts a
WHERE a.is_system AND (a.type = 'total' OR lower(a.name) = 'inter account transfers')
  AND NOT EXISTS (SELECT 1 FROM public.journal_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_lines l WHERE l.business_id = a.business_id AND l.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM public.receipts r, jsonb_array_elements(r.lines) x
                  WHERE r.business_id = a.business_id AND x->>'account_id' = a.id::text);

-- Existing system rows keep their ids (and names) and get their type.
UPDATE public.coa_accounts a SET system_account_type_id = s.id
FROM public.system_account_types s
WHERE a.is_system AND (
    (s.code = 'retained_earnings' AND lower(a.name) = 'retained earnings')
    OR (s.code = 'cash_control' AND lower(a.name) IN ('cash and cash equivalents', 'cash & cash equivalents')));

-- A used "Inter Account Transfers" row stays as an ordinary equity account.
-- Ungrouped accounts go to the root of their type.
UPDATE public.coa_accounts a SET group_id = root.id
FROM public.coa_root_groups r
JOIN public.coa_groups root ON root.root_key = r.key
WHERE a.group_id IS NULL AND r.account_type = a.type AND root.business_id = a.business_id;

-- Root-group flags replace is_system / is_orphaned.
ALTER TABLE public.coa_accounts DROP CONSTRAINT coa_accounts_type_values, DROP COLUMN is_system;
ALTER TABLE public.coa_accounts ALTER COLUMN group_id SET NOT NULL, ALTER COLUMN type DROP DEFAULT;
ALTER TABLE public.coa_accounts
    ADD CONSTRAINT coa_accounts_type_fkey FOREIGN KEY (type)
        REFERENCES public.coa_root_groups(account_type) ON DELETE RESTRICT,
    ADD CONSTRAINT coa_accounts_cash_flow_category_fkey FOREIGN KEY (cash_flow_category)
        REFERENCES public.cash_flow_categories(key) ON DELETE RESTRICT;
CREATE INDEX idx_coa_accounts_cash_flow_category ON public.coa_accounts (cash_flow_category)
    WHERE cash_flow_category IS NOT NULL;

ALTER TABLE public.coa_groups DROP CONSTRAINT coa_groups_type_values,
    DROP COLUMN is_system, DROP COLUMN is_orphaned;
ALTER TABLE public.coa_groups
    ADD CONSTRAINT coa_groups_type_fkey FOREIGN KEY (type) REFERENCES public.statement_types(key) ON DELETE RESTRICT,
    ADD CONSTRAINT coa_groups_root_has_no_parent CHECK ((root_key IS NULL) = (parent_group_id IS NOT NULL));
CREATE INDEX idx_coa_groups_type ON public.coa_groups (type);

-- 4. Structural triggers ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coa_group_root(p_business_id uuid, p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH RECURSIVE up(id, parent, root_key, depth) AS (
        SELECT g.id, g.parent_group_id, g.root_key, 0
        FROM public.coa_groups g WHERE g.business_id = p_business_id AND g.id = p_group_id
        UNION ALL
        SELECT g.id, g.parent_group_id, g.root_key, up.depth + 1
        FROM public.coa_groups g JOIN up ON g.business_id = p_business_id AND g.id = up.parent
        WHERE up.root_key IS NULL AND up.depth < 64
    )
    SELECT root_key FROM up WHERE root_key IS NOT NULL LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.coa_group_root(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.coa_groups_check_tree()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_parent_type text;
    v_root text;
BEGIN
    IF NEW.root_key IS NOT NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.root_key IS DISTINCT FROM NEW.root_key THEN
            RAISE EXCEPTION 'A root group cannot change' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.type <> (SELECT r.statement_type FROM public.coa_root_groups r WHERE r.key = NEW.root_key) THEN
            RAISE EXCEPTION 'A root group keeps its statement' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.root_key IS NOT NULL THEN
        RAISE EXCEPTION 'A root group cannot change' USING ERRCODE = 'check_violation';
    END IF;
    SELECT p.type INTO v_parent_type FROM public.coa_groups p
    WHERE p.business_id = NEW.business_id AND p.id = NEW.parent_group_id;
    IF v_parent_type IS NULL THEN
        RAISE EXCEPTION 'A group needs a parent group of the same business' USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent_type <> NEW.type THEN
        RAISE EXCEPTION 'A group must be on the same statement as its parent' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (
        WITH RECURSIVE up(id, parent, depth) AS (
            SELECT g.id, g.parent_group_id, 0 FROM public.coa_groups g
            WHERE g.business_id = NEW.business_id AND g.id = NEW.parent_group_id
            UNION ALL
            SELECT g.id, g.parent_group_id, up.depth + 1 FROM public.coa_groups g
            JOIN up ON g.business_id = NEW.business_id AND g.id = up.parent WHERE up.depth < 64
        )
        SELECT 1 FROM up WHERE up.id = NEW.id
    ) THEN
        RAISE EXCEPTION 'A group cannot be inside itself' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.parent_group_id IS DISTINCT FROM OLD.parent_group_id THEN
        v_root := public.coa_group_root(NEW.business_id, NEW.parent_group_id);
        IF EXISTS (
            WITH RECURSIVE sub(id) AS (
                SELECT NEW.id
                UNION ALL
                SELECT c.id FROM public.coa_groups c JOIN sub ON c.parent_group_id = sub.id
                WHERE c.business_id = NEW.business_id
            )
            SELECT 1 FROM public.coa_accounts a JOIN sub ON a.group_id = sub.id
            JOIN public.coa_root_groups r ON r.key = v_root
            WHERE a.business_id = NEW.business_id AND a.type <> r.account_type
        ) THEN
            RAISE EXCEPTION 'Its accounts do not belong under that root' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.coa_groups_check_tree() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coa_groups_check_tree
    BEFORE INSERT OR UPDATE OF parent_group_id, type, root_key ON public.coa_groups
    FOR EACH ROW EXECUTE FUNCTION public.coa_groups_check_tree();

CREATE OR REPLACE FUNCTION public.coa_accounts_check_root()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_root text := public.coa_group_root(NEW.business_id, NEW.group_id);
BEGIN
    IF v_root IS NULL THEN
        RAISE EXCEPTION 'An account needs a group of the same business' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.type <> (SELECT r.account_type FROM public.coa_root_groups r WHERE r.key = v_root) THEN
        RAISE EXCEPTION 'The account type must match the root of its group' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.system_account_type_id IS NOT NULL AND v_root <> (
        SELECT s.root_key FROM public.system_account_types s WHERE s.id = NEW.system_account_type_id
    ) THEN
        RAISE EXCEPTION 'A system account stays under its root' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.coa_accounts_check_root() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coa_accounts_check_root
    BEFORE INSERT OR UPDATE OF type, group_id, system_account_type_id ON public.coa_accounts
    FOR EACH ROW EXECUTE FUNCTION public.coa_accounts_check_root();

-- 5. Country templates (data, not code; understanding.md §6.2) ------------------------------
CREATE TABLE public.country_templates (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    key              TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    name             TEXT NOT NULL,
    country_id       UUID NULL UNIQUE REFERENCES public.countries(id) ON DELETE RESTRICT,
    base_currency_id UUID NOT NULL REFERENCES public.currencies(id) ON DELETE RESTRICT,
    date_format      TEXT NOT NULL,
    number_format    TEXT NOT NULL
);
-- Exactly one generic template (no country): used when the country has none.
CREATE UNIQUE INDEX uq_country_templates_generic ON public.country_templates ((true)) WHERE country_id IS NULL;
CREATE INDEX idx_country_templates_base_currency_id ON public.country_templates (base_currency_id);

CREATE TABLE public.country_template_groups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    template_id UUID NOT NULL REFERENCES public.country_templates(id) ON DELETE CASCADE,
    root_key    TEXT NOT NULL REFERENCES public.coa_root_groups(key) ON DELETE RESTRICT,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    sort_order  SMALLINT NOT NULL,
    CONSTRAINT country_template_groups_name_key UNIQUE (template_id, name),
    CONSTRAINT country_template_groups_template_id_id_key UNIQUE (template_id, id)
);
CREATE INDEX idx_country_template_groups_root_key ON public.country_template_groups (root_key);

-- An account sits under a template group or directly under a root (exactly one).
CREATE TABLE public.country_template_accounts (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    template_id        UUID NOT NULL REFERENCES public.country_templates(id) ON DELETE CASCADE,
    group_id           UUID NULL,
    root_key           TEXT NULL REFERENCES public.coa_root_groups(key) ON DELETE RESTRICT,
    code               TEXT NOT NULL CHECK (char_length(code) BETWEEN 1 AND 30),
    name               TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    cash_flow_category TEXT NULL REFERENCES public.cash_flow_categories(key) ON DELETE RESTRICT,
    sort_order         SMALLINT NOT NULL,
    CONSTRAINT country_template_accounts_code_key UNIQUE (template_id, code),
    CONSTRAINT country_template_accounts_group_fkey FOREIGN KEY (template_id, group_id)
        REFERENCES public.country_template_groups(template_id, id) ON DELETE CASCADE,
    CONSTRAINT country_template_accounts_one_parent CHECK ((group_id IS NULL) <> (root_key IS NULL))
);
CREATE INDEX idx_country_template_accounts_group ON public.country_template_accounts (template_id, group_id)
    WHERE group_id IS NOT NULL;
CREATE INDEX idx_country_template_accounts_root_key ON public.country_template_accounts (root_key)
    WHERE root_key IS NOT NULL;
CREATE INDEX idx_country_template_accounts_cash_flow ON public.country_template_accounts (cash_flow_category)
    WHERE cash_flow_category IS NOT NULL;

INSERT INTO public.country_templates (key, name, country_id, base_currency_id, date_format, number_format)
SELECT 'generic', 'Generic chart', NULL, c.id, 'MM/dd/yyyy', '1,234.56'
FROM public.currencies c WHERE c.is_platform_default;
INSERT INTO public.country_templates (key, name, country_id, base_currency_id, date_format, number_format)
SELECT 'pk', 'Pakistan', k.id, c.id, 'dd/MM/yyyy', '1,234.56'
FROM public.countries k, public.currencies c WHERE k.code = 'PK' AND c.code = 'PKR';

-- Generic ("Simple" P&L, understanding.md §6.2 en-US): accounts directly under the roots.
INSERT INTO public.country_template_accounts (template_id, root_key, code, name, sort_order)
SELECT t.id, v.root_key, v.code, v.name, v.sort_order
FROM public.country_templates t, (VALUES
    ('income',   '4000', 'Sales', 0),
    ('income',   '4100', 'Interest received', 1),
    ('expenses', '6000', 'Accounting fees', 0),
    ('expenses', '6010', 'Advertising and promotion', 1),
    ('expenses', '6020', 'Bank charges', 2),
    ('expenses', '6030', 'Computer equipment', 3),
    ('expenses', '6040', 'Electricity', 4),
    ('expenses', '6050', 'Legal fees', 5),
    ('expenses', '6060', 'Motor vehicle expenses', 6),
    ('expenses', '6070', 'Printing and stationery', 7),
    ('expenses', '6080', 'Rent', 8),
    ('expenses', '6090', 'Repairs and maintenance', 9),
    ('expenses', '6100', 'Telephone', 10)
) AS v(root_key, code, name, sort_order)
WHERE t.key = 'generic';

-- Pakistan: PKR, dd/MM/yyyy, grouped P&L (tax codes arrive with tax_codes in B4).
INSERT INTO public.country_template_groups (template_id, root_key, name, sort_order)
SELECT t.id, v.root_key, v.name, v.sort_order
FROM public.country_templates t, (VALUES
    ('income',   'Revenue', 0),
    ('expenses', 'Cost of sales', 0),
    ('expenses', 'Operating expenses', 1)
) AS v(root_key, name, sort_order)
WHERE t.key = 'pk';
INSERT INTO public.country_template_accounts (template_id, group_id, code, name, sort_order)
SELECT t.id, g.id, v.code, v.name, v.sort_order
FROM public.country_templates t
JOIN (VALUES
    ('Revenue',            '4000', 'Sales', 0),
    ('Revenue',            '4100', 'Other income', 1),
    ('Cost of sales',      '5000', 'Cost of goods sold', 0),
    ('Operating expenses', '6000', 'Salaries and wages', 0),
    ('Operating expenses', '6010', 'Rent', 1),
    ('Operating expenses', '6020', 'Electricity', 2),
    ('Operating expenses', '6030', 'Gas', 3),
    ('Operating expenses', '6040', 'Telephone and internet', 4),
    ('Operating expenses', '6050', 'Bank charges', 5),
    ('Operating expenses', '6060', 'Fuel', 6),
    ('Operating expenses', '6070', 'Printing and stationery', 7),
    ('Operating expenses', '6080', 'Repairs and maintenance', 8),
    ('Operating expenses', '6090', 'Professional fees', 9)
) AS v(group_name, code, name, sort_order) ON true
JOIN public.country_template_groups g ON g.template_id = t.id AND g.name = v.group_name
WHERE t.key = 'pk';

-- 6. businesses.country -> country_id --------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN country_id UUID NULL REFERENCES public.countries(id) ON DELETE RESTRICT;
CREATE INDEX idx_businesses_country_id ON public.businesses (country_id) WHERE country_id IS NOT NULL;
UPDATE public.businesses b SET country_id = c.id
FROM public.countries c
WHERE b.country IS NOT NULL AND (lower(btrim(b.country)) = lower(c.name) OR upper(btrim(b.country)) = c.code);
DO $$
DECLARE
    v_row record;
BEGIN
    FOR v_row IN SELECT id, country FROM public.businesses
                 WHERE country IS NOT NULL AND btrim(country) <> '' AND country_id IS NULL LOOP
        RAISE NOTICE 'Business % country "%" matched no country; set it again in Business details',
            v_row.id, v_row.country;
    END LOOP;
END $$;
ALTER TABLE public.businesses DROP COLUMN country;

-- 7. Seeding: roots + system accounts (every business), template (new businesses) -------------
CREATE OR REPLACE FUNCTION public.seed_business_chart(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.coa_groups (business_id, name, type, parent_group_id, sort_order, root_key)
    SELECT p_business_id, r.name, r.statement_type, NULL, r.sort_order, r.key
    FROM public.coa_root_groups r
    ON CONFLICT (business_id, root_key) DO NOTHING;

    INSERT INTO public.coa_accounts (business_id, name, group_id, type, sort_order, system_account_type_id)
    SELECT p_business_id, s.name, g.id, r.account_type, s.sort_order, s.id
    FROM public.system_account_types s
    JOIN public.coa_root_groups r ON r.key = s.root_key
    JOIN public.coa_groups g ON g.business_id = p_business_id AND g.root_key = s.root_key
    ON CONFLICT (business_id, system_account_type_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_business_chart(uuid) FROM PUBLIC, anon, authenticated;

-- Adds what is missing (groups by name under their root, accounts by code); the base currency and
-- formats only while the business has no journal entries. Returns the number of rows added.
CREATE OR REPLACE FUNCTION public.apply_country_template(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_template public.country_templates;
    v_groups integer;
    v_accounts integer;
BEGIN
    SELECT t.* INTO v_template FROM public.country_templates t
    JOIN public.businesses b ON b.id = p_business_id
    WHERE t.country_id IS NOT DISTINCT FROM b.country_id;
    IF NOT FOUND THEN
        SELECT t.* INTO v_template FROM public.country_templates t WHERE t.country_id IS NULL;
    END IF;

    INSERT INTO public.coa_groups (business_id, name, type, parent_group_id, sort_order)
    SELECT p_business_id, tg.name, r.statement_type, root.id, tg.sort_order
    FROM public.country_template_groups tg
    JOIN public.coa_root_groups r ON r.key = tg.root_key
    JOIN public.coa_groups root ON root.business_id = p_business_id AND root.root_key = tg.root_key
    WHERE tg.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.coa_groups g WHERE g.business_id = p_business_id
                      AND g.parent_group_id = root.id AND lower(g.name) = lower(tg.name));
    GET DIAGNOSTICS v_groups = ROW_COUNT;

    INSERT INTO public.coa_accounts (business_id, name, code, group_id, type, cash_flow_category, sort_order)
    SELECT p_business_id, ta.name, ta.code, target.id, r.account_type, ta.cash_flow_category, ta.sort_order
    FROM public.country_template_accounts ta
    LEFT JOIN public.country_template_groups tg ON tg.template_id = ta.template_id AND tg.id = ta.group_id
    JOIN public.coa_root_groups r ON r.key = COALESCE(ta.root_key, tg.root_key)
    JOIN public.coa_groups root ON root.business_id = p_business_id AND root.root_key = r.key
    JOIN LATERAL (
        SELECT g.id FROM public.coa_groups g
        WHERE g.business_id = p_business_id
          AND ((tg.id IS NULL AND g.id = root.id)
               OR (tg.id IS NOT NULL AND g.parent_group_id = root.id AND lower(g.name) = lower(tg.name)))
        ORDER BY g.id LIMIT 1
    ) target ON true
    WHERE ta.template_id = v_template.id
    ON CONFLICT (business_id, code) DO NOTHING;
    GET DIAGNOSTICS v_accounts = ROW_COUNT;

    IF NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.business_id = p_business_id) THEN
        UPDATE public.business_currencies SET currency_id = v_template.base_currency_id
        WHERE business_id = p_business_id AND is_base AND currency_id <> v_template.base_currency_id;
        INSERT INTO public.business_format (business_id, date_format, number_format)
        VALUES (p_business_id, v_template.date_format, v_template.number_format)
        ON CONFLICT (business_id) DO UPDATE
            SET date_format = COALESCE(public.business_format.date_format, EXCLUDED.date_format),
                number_format = COALESCE(public.business_format.number_format, EXCLUDED.number_format);
    END IF;
    RETURN v_groups + v_accounts;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_country_template(uuid) FROM PUBLIC, anon, authenticated;

-- AFTER INSERT triggers fire in name order: base currency and settings exist by now.
CREATE OR REPLACE FUNCTION public.businesses_seed_chart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.seed_business_chart(NEW.id);
    PERFORM public.apply_country_template(NEW.id);
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.businesses_seed_chart() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER businesses_seed_chart
    AFTER INSERT ON public.businesses
    FOR EACH ROW EXECUTE FUNCTION public.businesses_seed_chart();

-- Existing businesses: missing roots and system accounts only (no template, no new P&L rows).
DO $$
BEGIN
    PERFORM public.seed_business_chart(b.id) FROM public.businesses b;
END $$;

-- 8. Opening balances (domain-model §3.5, D-35) ----------------------------------------------
INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT 'settings.starting_balances', 'Starting balances', m.id, NULL, false, false, 125
FROM public.modules m WHERE m.key = 'settings'
ON CONFLICT (key) DO NOTHING;
-- new area settings.starting_balances: custom members have no rights until granted; owners/full members see it immediately
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, 'settings.starting_balances', r.key
FROM public.access_presets p CROSS JOIN public.area_rights r
WHERE p.key = 'accountant'
ON CONFLICT DO NOTHING;
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, 'settings.starting_balances', 'view'
FROM public.access_presets p WHERE p.key = 'view_only'
ON CONFLICT DO NOTHING;

INSERT INTO public.document_types (key, name) VALUES ('opening_balance', 'Opening balance');
INSERT INTO public.document_type_areas (document_type_id, area_key)
SELECT id, 'settings.starting_balances' FROM public.document_types WHERE key = 'opening_balance';

CREATE TABLE public.opening_balance_kinds (
    key  TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]*$'),
    name TEXT NOT NULL
);
-- Later phases add bank_account (B3), invoice (B4/B5), item (B6), asset/party/investment (B9-B11).
INSERT INTO public.opening_balance_kinds (key, name) VALUES ('account', 'Balance sheet account');

CREATE TABLE public.opening_balances (
    document_id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    kind_key    TEXT NOT NULL REFERENCES public.opening_balance_kinds(key) ON DELETE RESTRICT,
    account_id  UUID NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT opening_balances_business_id_id_key UNIQUE (business_id, document_id),
    CONSTRAINT opening_balances_document_fkey FOREIGN KEY (business_id, document_id)
        REFERENCES public.documents(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT opening_balances_account_fkey FOREIGN KEY (business_id, account_id)
        REFERENCES public.coa_accounts(business_id, id) ON DELETE RESTRICT,
    CONSTRAINT opening_balances_source_matches_kind CHECK ((kind_key = 'account') = (account_id IS NOT NULL))
);
CREATE INDEX idx_opening_balances_business_account ON public.opening_balances (business_id, account_id)
    WHERE account_id IS NOT NULL;
CREATE INDEX idx_opening_balances_kind_key ON public.opening_balances (kind_key);

-- At most one non-void opening balance per source record.
CREATE OR REPLACE FUNCTION public.opening_balances_one_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text || ':' || NEW.account_id::text, 0));
    IF EXISTS (
        SELECT 1 FROM public.opening_balances o
        JOIN public.documents d ON d.business_id = o.business_id AND d.id = o.document_id
        JOIN public.document_statuses s ON s.id = d.status_id
        WHERE o.business_id = NEW.business_id AND o.account_id = NEW.account_id
          AND o.document_id <> NEW.document_id AND s.key <> 'void'
    ) THEN
        RAISE EXCEPTION 'This record already has a starting balance' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.opening_balances_one_live() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER opening_balances_one_live
    BEFORE INSERT ON public.opening_balances
    FOR EACH ROW EXECUTE FUNCTION public.opening_balances_one_live();

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.opening_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.opening_balances TO bookvault_api;
GRANT ALL ON public.opening_balances TO service_role;
CREATE POLICY opening_balances_api_select ON public.opening_balances FOR SELECT TO bookvault_api
    USING (public.is_business_member(business_id)
           AND (public.has_area_access(business_id, 'settings.starting_balances', 'view')
                OR public.has_area_access(business_id, 'reports', 'view')));
CREATE POLICY opening_balances_api_insert ON public.opening_balances FOR INSERT TO bookvault_api
    WITH CHECK (public.has_area_write_access(business_id, 'settings.starting_balances'));
CREATE POLICY opening_balances_service_role_all ON public.opening_balances TO service_role
    USING (true) WITH CHECK (true);

-- Reference tables: readable by the API, writable by nobody but migrations.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['statement_types', 'cash_flow_categories', 'coa_root_groups',
                             'system_account_types', 'country_templates', 'country_template_groups',
                             'country_template_accounts', 'opening_balance_kinds'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT SELECT ON public.%I TO bookvault_api', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO bookvault_api USING (true)',
                       t || '_api_select', t);
    END LOOP;
END
$$;

-- 9. Purge and export cover opening_balances (children first)
GRANT SELECT, DELETE ON public.opening_balances TO bookvault_purge;
GRANT CREATE ON SCHEMA public TO bookvault_purge;
SET ROLE bookvault_purge;  -- owner of the function (20261108000018)
CREATE OR REPLACE FUNCTION public.business_scoped_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT ARRAY[
        'business_member_area_access', 'idempotency_keys', 'journal_lines', 'journal_entries',
        'opening_balances', 'document_lines', 'documents', 'document_sequences', 'business_currencies',
        'receipts', 'bank_accounts', 'customers', 'suppliers', 'coa_accounts', 'coa_groups',
        'business_tab_columns', 'business_tabs', 'business_format', 'business_details',
        'business_members', 'audit_logs'
    ];
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM bookvault_purge;
