-- Add 'customers' admin tab so it appears in the business shell sidebar.
-- Rollback: DELETE FROM public.admin_tabs WHERE key = 'customers';

INSERT INTO public.admin_tabs (key, label, enabled, order_index)
VALUES ('customers', 'Customers', TRUE, 4)
ON CONFLICT (key) DO NOTHING;
