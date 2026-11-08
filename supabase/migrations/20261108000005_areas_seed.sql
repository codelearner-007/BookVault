-- ==============================================
-- Migration: modules + areas seed and access presets (B0.3)
-- Date: 2026-11-08
--
-- The explicit seed of platform-model Appendix A.1/A.2 for everything that
-- exists today (phase B0.3). Each later phase inserts only its own areas rows,
-- with the note:
--   -- new area <key>: custom members have no rights until granted; owners/full members see it immediately
--
-- Presets (D-39) are UI templates that only tick boxes in a custom grid; they
-- are snapshots, so areas added later are not ticked.
--
-- ROLLBACK (run manually):
--   DELETE FROM public.access_preset_rights;
--   DELETE FROM public.access_presets;
--   DELETE FROM public.areas;
--   DELETE FROM public.modules;
-- ==============================================

INSERT INTO public.modules (key, label, sort_order) VALUES
    ('platform',  'Platform', 0),
    ('account',   'Account', 1),
    ('general',   'General', 2),
    ('banking',   'Banking', 3),
    ('sales',     'Sales', 4),
    ('purchases', 'Purchases', 5),
    ('inventory', 'Items and inventory', 6),
    ('tax',       'Tax', 7),
    ('assets',    'Assets and investments', 8),
    ('payroll',   'Employees and expense claims', 9),
    ('equity',    'Equity', 10),
    ('projects',  'Projects and billable work', 11),
    ('settings',  'Settings', 12);

INSERT INTO public.areas (key, label, module_id, tab_key, is_owner_only, is_view_only, sort_order)
SELECT v.key, v.label, m.id, v.tab_key, v.is_owner_only, v.is_view_only, v.sort_order
FROM (VALUES
    ('platform.users',             'Users',                       'platform', NULL,                     false, false, 0),
    ('platform.admins',            'Platform roles',              'platform', NULL,                     false, false, 1),
    ('platform.settings',          'Platform settings',           'platform', NULL,                     false, false, 2),
    ('platform.audit',             'Platform audit',              'platform', NULL,                     false, false, 3),
    ('platform.modules_catalog',   'Modules catalog',             'platform', NULL,                     false, false, 4),
    ('account.businesses',         'My businesses',               'account',  NULL,                     true,  false, 10),
    ('settings.members',           'Members and access',          'settings', 'members',                true,  false, 20),
    ('summary',                    'Summary',                     'general',  'summary',                false, true,  30),
    ('journal_entries',            'Journal entries',             'general',  'journal-entries',        false, false, 31),
    ('reports',                    'Reports',                     'general',  'reports',                false, true,  32),
    ('history',                    'History',                     'general',  NULL,                     false, true,  33),
    ('export',                     'Export',                      'general',  NULL,                     false, true,  34),
    ('bank_cash_accounts',         'Bank and cash accounts',      'banking',  'bank-and-cash-accounts', false, false, 40),
    ('receipts',                   'Receipts',                    'banking',  'receipt',                false, false, 41),
    ('suspense',                   'Suspense',                    'banking',  NULL,                     false, false, 42),
    ('customers',                  'Customers',                   'sales',    'customers',              false, false, 50),
    ('suppliers',                  'Suppliers',                   'purchases','suppliers',              false, false, 60),
    ('settings.business_details',  'Business details',            'settings', NULL,                     false, false, 120),
    ('settings.chart_of_accounts', 'Chart of accounts',           'settings', NULL,                     false, false, 121),
    ('settings.customize_tabs',    'Customize tabs and columns',  'settings', NULL,                     false, false, 122)
) AS v(key, label, module_key, tab_key, is_owner_only, is_view_only, sort_order)
JOIN public.modules m ON m.key = v.module_key;

INSERT INTO public.access_presets (key, label, sort_order) VALUES
    ('view_only',  'View only',  0),
    ('bookkeeper', 'Bookkeeper', 1),
    ('accountant', 'Accountant', 2);

-- View only: view on every grantable area.
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.key, 'view'
FROM public.access_presets p
CROSS JOIN public.areas a
JOIN public.modules m ON m.id = a.module_id
WHERE p.key = 'view_only' AND NOT a.is_owner_only AND m.key <> 'platform';

-- Bookkeeper: view + create + edit on banking/sales/purchases/inventory/payroll/projects
-- and journal entries; view on summary and reports; no delete, settings, history or export.
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.key, r.key
FROM public.access_presets p
CROSS JOIN public.areas a
JOIN public.modules m ON m.id = a.module_id
CROSS JOIN public.area_rights r
WHERE p.key = 'bookkeeper'
  AND (m.key IN ('banking', 'sales', 'purchases', 'inventory', 'payroll', 'projects')
       OR a.key = 'journal_entries')
  AND r.key IN ('view', 'create', 'edit');
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.key, 'view'
FROM public.access_presets p CROSS JOIN public.areas a
WHERE p.key = 'bookkeeper' AND a.key IN ('summary', 'reports');

-- Accountant: all four rights on the bookkeeper areas plus the accounting settings;
-- view on summary, reports, history, export.
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.key, r.key
FROM public.access_presets p
CROSS JOIN public.areas a
JOIN public.modules m ON m.id = a.module_id
CROSS JOIN public.area_rights r
WHERE p.key = 'accountant'
  AND (m.key IN ('banking', 'sales', 'purchases', 'inventory', 'payroll', 'projects')
       OR a.key IN ('journal_entries', 'settings.chart_of_accounts', 'settings.tax_codes',
                    'settings.currencies', 'settings.lock_date', 'settings.starting_balances'));
INSERT INTO public.access_preset_rights (preset_id, area_key, right_key)
SELECT p.id, a.key, 'view'
FROM public.access_presets p CROSS JOIN public.areas a
WHERE p.key = 'accountant' AND a.key IN ('summary', 'reports', 'history', 'export');
