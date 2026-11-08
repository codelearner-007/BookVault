-- Pre-check for 20261108000033 (runbook B0.8 step 1; NA-03 sign-off of the B3 receipt migration report).
-- Read-only. Section A must return zero rows (the migration refuses to run otherwise): every legacy
-- receipt row must already be a receipt document with the same id (posted or draft, B3 migration).
-- Section B lists what is dropped (row count and the columns that were kept read-only for rollback).

-- A. Blocking problems
SELECT 'receipt_not_migrated' AS problem, r.business_id, r.id::text AS detail
FROM public.receipts r
LEFT JOIN public.documents d ON d.business_id = r.business_id AND d.id = r.id
LEFT JOIN public.document_types t ON t.id = d.document_type_id AND t.key = 'receipt'
WHERE t.id IS NULL;

-- B. What is dropped
SELECT count(*) AS legacy_receipts,
       count(*) FILTER (WHERE image_url IS NOT NULL) AS with_image_url,
       count(*) FILTER (WHERE jsonb_array_length(COALESCE(lines, '[]'::jsonb)) > 0) AS with_lines
FROM public.receipts;
