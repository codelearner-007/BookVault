-- ==============================================
-- ADMIN TABS SEED DATA
-- Run after migrations to populate default global tabs.
-- `enabled`         the tab is globally available to all businesses.
-- `default_enabled` the tab is ON for a business that has not saved its own choice
--                   (only 'summary' and 'settings'; B0.5 moved this from code to data).
-- ==============================================

INSERT INTO public.admin_tabs (key, label, enabled, default_enabled, order_index) VALUES
    ('summary',         'Summary',          TRUE, TRUE,  0),
    ('settings',        'Settings',         TRUE, TRUE,  1),
    ('journal-entries', 'Journal Entries',  TRUE, FALSE, 2),
    ('reports',         'Reports',          TRUE, FALSE, 3),
    ('members',         'Members',          TRUE, FALSE, 4)
ON CONFLICT (key) DO UPDATE SET
    label           = EXCLUDED.label,
    enabled         = EXCLUDED.enabled,
    default_enabled = EXCLUDED.default_enabled,
    order_index     = EXCLUDED.order_index;
