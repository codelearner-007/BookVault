-- History is a top-bar page, not a sidebar tab — remove from admin_tabs.
-- Rollback: INSERT INTO public.admin_tabs (key, label, enabled, order_index) VALUES ('history', 'History', TRUE, 6) ON CONFLICT (key) DO NOTHING;

DELETE FROM public.admin_tabs WHERE key = 'history';
