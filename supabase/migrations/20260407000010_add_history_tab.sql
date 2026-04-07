-- History is a top-bar page, not a sidebar tab — remove it from admin_tabs if it was added.
-- Rollback: no-op (nothing inserted)

DELETE FROM public.admin_tabs WHERE key = 'history';
