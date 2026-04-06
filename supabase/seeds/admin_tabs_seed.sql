-- ==============================================
-- ADMIN TABS SEED DATA
-- Run after migrations to populate default global tabs.
-- `enabled` here means the tab is globally available to all businesses.
-- Per-business default state is controlled by DEFAULT_ENABLED_TABS in
-- business_service.py — only 'summary' and 'settings' are ON by default
-- for new businesses; all other tabs start OFF until explicitly enabled.
-- ==============================================

INSERT INTO public.admin_tabs (key, label, enabled, order_index) VALUES
    ('summary',         'Summary',          TRUE, 0),
    ('settings',        'Settings',         TRUE, 1),
    ('journal-entries', 'Journal Entries',  TRUE, 2),
    ('reports',         'Reports',          TRUE, 3),
    ('members',         'Members',          TRUE, 4)
ON CONFLICT (key) DO UPDATE SET
    label       = EXCLUDED.label,
    enabled     = EXCLUDED.enabled,
    order_index = EXCLUDED.order_index;
