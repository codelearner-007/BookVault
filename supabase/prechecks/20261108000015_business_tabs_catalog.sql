-- Pre-check for 20261108000015 (runbook B0.8 step 1): must return zero rows.
-- business_tabs keys that have no admin_tabs row (the new FK would reject them).
SELECT bt.business_id, bt.key
FROM public.business_tabs bt
LEFT JOIN public.admin_tabs t ON t.key = bt.key
WHERE t.id IS NULL;
