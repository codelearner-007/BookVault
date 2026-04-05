-- ==============================================
-- Migration: Add soft-delete to businesses
-- Description: Adds deleted_at column to public.businesses and a partial
--              index on active (non-deleted) rows. No data loss — additive only.
--              No RLS changes required; existing service_role policy covers all rows.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-05
-- ==============================================

-- ==============================================
-- STEP 1: ADD COLUMN
-- ==============================================

-- NULL means the business is active; a timestamp means it was soft-deleted.
ALTER TABLE public.businesses
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL;

-- ==============================================
-- STEP 2: CREATE PARTIAL INDEX
-- ==============================================

-- Partial index covering only active (non-deleted) rows.
-- List queries should filter WHERE deleted_at IS NULL; this index
-- makes those scans efficient without bloating it with deleted rows.
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at
    ON public.businesses (deleted_at)
    WHERE deleted_at IS NULL;

-- ==============================================
-- ROLLBACK (run manually if needed)
-- ==============================================
-- DROP INDEX  IF EXISTS idx_businesses_deleted_at;
-- ALTER TABLE public.businesses DROP COLUMN IF EXISTS deleted_at;
