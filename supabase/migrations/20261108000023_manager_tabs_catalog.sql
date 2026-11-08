-- ==============================================
-- Migration: every Manager tab in the admin_tabs catalog (B0 screens)
-- Date: 2026-11-08
--
-- Seeds admin_tabs with all 40 Manager tabs in Manager's sidebar order
-- (frontend/src/lib/navigation/business-tabs.js holds the same list) and the
-- matching areas rows of platform-model Appendix A.2 that are missing.
--
--   * New tabs are default_enabled = false: a business sees them only after
--     enabling them in Customize tabs; until their phase is built the shell
--     shows a "Coming soon" page.
--   * Existing businesses keep their enabled tabs: business_tabs is not touched,
--     and existing catalog rows keep enabled/default_enabled (only label and
--     order_index follow Manager).
--   * parent_id is set for new child tabs only. receipts stays without a parent:
--     businesses already have receipts on while bank-and-cash-accounts was never
--     in the catalog, and a parent would make their next Customize save fail.
--   * No new grants or policies: admin_tabs and areas already have the B0.4
--     bookvault_api policies (20261108000009_tenant_rls_policies.sql).
--
-- new areas (each): custom members have no rights until granted; owners/full members see it immediately.
-- Access presets are snapshots (20261108000005_areas_seed.sql), so they do not tick the new areas.
--
-- ROLLBACK (run manually):
--   DELETE FROM public.business_tabs WHERE key IN (<the new tab keys below>);
--   DELETE FROM public.admin_tabs WHERE key IN (<the new tab keys below>);
--   DELETE FROM public.areas WHERE key IN (<the new area keys below>);
--   (business_member_area_access rows on those areas cascade or must be deleted first)
--   UPDATE public.admin_tabs SET order_index = v.i FROM (VALUES ('summary',0),('journal-entries',1),
--     ('reports',2),('settings',3),('customers',4),('suppliers',5),('receipts',6)) v(k,i) WHERE key = v.k;
-- ==============================================

CREATE TEMP TABLE manager_tabs (key TEXT, label TEXT, parent_key TEXT, order_index INTEGER);
INSERT INTO manager_tabs (key, label, parent_key, order_index) VALUES
    ('summary',                  'Summary',                  NULL,                     0),
    ('bank-and-cash-accounts',   'Bank and Cash Accounts',   NULL,                     1),
    ('receipts',                 'Receipts',                 NULL,                     2),
    ('payments',                 'Payments',                 'bank-and-cash-accounts', 3),
    ('inter-account-transfers',  'Inter Account Transfers',  'bank-and-cash-accounts', 4),
    ('bank-reconciliations',     'Bank Reconciliations',     'bank-and-cash-accounts', 5),
    ('expense-claims',           'Expense Claims',           NULL,                     6),
    ('customers',                'Customers',                NULL,                     7),
    ('sales-quotes',             'Sales Quotes',             'customers',              8),
    ('sales-orders',             'Sales Orders',             'customers',              9),
    ('sales-invoices',           'Sales Invoices',           'customers',              10),
    ('credit-notes',             'Credit Notes',             'sales-invoices',         11),
    ('late-payment-fees',        'Late Payment Fees',        'sales-invoices',         12),
    ('delivery-notes',           'Delivery Notes',           'customers',              13),
    ('billable-time',            'Billable Time',            'customers',              14),
    ('withholding-tax-receipts', 'Withholding Tax Receipts', 'customers',              15),
    ('suppliers',                'Suppliers',                NULL,                     16),
    ('purchase-quotes',          'Purchase Quotes',          'suppliers',              17),
    ('purchase-orders',          'Purchase Orders',          'suppliers',              18),
    ('purchase-invoices',        'Purchase Invoices',        'suppliers',              19),
    ('debit-notes',              'Debit Notes',              'purchase-invoices',      20),
    ('goods-receipts',           'Goods Receipts',           'suppliers',              21),
    ('inventory-items',          'Inventory Items',          NULL,                     22),
    ('inventory-transfers',      'Inventory Transfers',      'inventory-items',        23),
    ('inventory-write-offs',     'Inventory Write-offs',     'inventory-items',        24),
    ('production-orders',        'Production Orders',        'inventory-items',        25),
    ('projects',                 'Projects',                 NULL,                     26),
    ('employees',                'Employees',                NULL,                     27),
    ('payslips',                 'Payslips',                 'employees',              28),
    ('investments',              'Investments',              NULL,                     29),
    ('fixed-assets',             'Fixed Assets',             NULL,                     30),
    ('depreciation-entries',     'Depreciation Entries',     'fixed-assets',           31),
    ('intangible-assets',        'Intangible Assets',        NULL,                     32),
    ('amortization-entries',     'Amortization Entries',     'intangible-assets',      33),
    ('capital-accounts',         'Capital Accounts',         NULL,                     34),
    ('special-accounts',         'Special Accounts',         NULL,                     35),
    ('journal-entries',          'Journal Entries',          NULL,                     36),
    ('folders',                  'Folders',                  NULL,                     37),
    ('reports',                  'Reports',                  NULL,                     38),
    ('settings',                 'Settings',                 NULL,                     39);

-- Existing rows: Manager's label and order only.
UPDATE public.admin_tabs t
SET label = m.label, order_index = m.order_index
FROM manager_tabs m
WHERE t.key = m.key;

-- New rows: on in the catalog, off per business until enabled in Customize tabs.
INSERT INTO public.admin_tabs (key, label, enabled, default_enabled, order_index)
SELECT m.key, m.label, true, false, m.order_index
FROM manager_tabs m
WHERE NOT EXISTS (SELECT 1 FROM public.admin_tabs t WHERE t.key = m.key);

-- Parents of the new child tabs only (see header for receipts).
UPDATE public.admin_tabs c
SET parent_id = p.id
FROM manager_tabs m
JOIN public.admin_tabs p ON p.key = m.parent_key
WHERE c.key = m.key AND m.parent_key IS NOT NULL AND c.parent_id IS NULL;

-- Areas of platform-model Appendix A.2 for the tabs that had none.
INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT v.key, v.label, mo.id, v.tab_key, false, false, v.sort_order
FROM (VALUES
    ('folders_attachments',      'Folders and attachments',  'general',   'folders',                  35),
    ('payments',                 'Payments',                 'banking',   'payments',                 43),
    ('inter_account_transfers',  'Inter account transfers',  'banking',   'inter-account-transfers',  44),
    ('bank_reconciliations',     'Bank reconciliations',     'banking',   'bank-reconciliations',     45),
    ('sales_quotes',             'Sales quotes',             'sales',     'sales-quotes',             51),
    ('sales_orders',             'Sales orders',             'sales',     'sales-orders',             52),
    ('sales_invoices',           'Sales invoices',           'sales',     'sales-invoices',           53),
    ('credit_notes',             'Credit notes',             'sales',     'credit-notes',             54),
    ('late_payment_fees',        'Late payment fees',        'sales',     'late-payment-fees',        55),
    ('delivery_notes',           'Delivery notes',           'sales',     'delivery-notes',           56),
    ('purchase_quotes',          'Purchase quotes',          'purchases', 'purchase-quotes',          61),
    ('purchase_orders',          'Purchase orders',          'purchases', 'purchase-orders',          62),
    ('purchase_invoices',        'Purchase invoices',        'purchases', 'purchase-invoices',        63),
    ('debit_notes',              'Debit notes',              'purchases', 'debit-notes',              64),
    ('goods_receipts',           'Goods receipts',           'purchases', 'goods-receipts',           65),
    ('inventory_items',          'Inventory items',          'inventory', 'inventory-items',          70),
    ('inventory_transfers',      'Inventory transfers',      'inventory', 'inventory-transfers',      71),
    ('inventory_write_offs',     'Inventory write-offs',     'inventory', 'inventory-write-offs',     72),
    ('production_orders',        'Production orders',        'inventory', 'production-orders',        73),
    ('withholding_tax_receipts', 'Withholding tax receipts', 'tax',       'withholding-tax-receipts', 80),
    ('investments',              'Investments',              'assets',    'investments',              90),
    ('fixed_assets',             'Fixed assets',             'assets',    'fixed-assets',             91),
    ('depreciation_entries',     'Depreciation entries',     'assets',    'depreciation-entries',     92),
    ('intangible_assets',        'Intangible assets',        'assets',    'intangible-assets',        93),
    ('amortization_entries',     'Amortization entries',     'assets',    'amortization-entries',     94),
    ('expense_claims',           'Expense claims',           'payroll',   'expense-claims',           100),
    ('employees',                'Employees',                'payroll',   'employees',                101),
    ('payslips',                 'Payslips',                 'payroll',   'payslips',                 102),
    ('capital_accounts',         'Capital accounts',         'equity',    'capital-accounts',         110),
    ('special_accounts',         'Special accounts',         'equity',    'special-accounts',         111),
    ('projects',                 'Projects',                 'projects',  'projects',                 115),
    ('billable_time',            'Billable time',            'projects',  'billable-time',            116)
) AS v(key, label, module_key, tab_key, sort_order)
JOIN public.modules mo ON mo.key = v.module_key
WHERE NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.key = v.key);

-- Fail loudly if the catalog is not exactly Manager's 40 tabs, each with an area (settings: its sub-areas).
DO $$
BEGIN
    IF (SELECT count(*) FROM public.admin_tabs t JOIN manager_tabs m ON m.key = t.key) <> 40 THEN
        RAISE EXCEPTION 'admin_tabs does not hold the 40 Manager tabs';
    END IF;
    IF EXISTS (SELECT 1 FROM manager_tabs m
               WHERE m.key <> 'settings'
                 AND NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.tab_key = m.key)) THEN
        RAISE EXCEPTION 'a Manager tab has no area';
    END IF;
END
$$;
DROP TABLE manager_tabs;
