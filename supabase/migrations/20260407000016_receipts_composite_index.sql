-- ============================================
-- Migration: Add composite index on receipts for business_id + date + created_at
-- Description: Optimizes the main receipt list query pattern:
--              WHERE business_id = ? ORDER BY date DESC, created_at DESC
--              Replaces the need for PostgreSQL to filter on single-column
--              idx_receipts_business_id then sort in memory.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-07
-- ============================================

CREATE INDEX IF NOT EXISTS idx_receipts_business_date
    ON public.receipts (business_id, date DESC, created_at DESC);

-- rollback: DROP INDEX IF EXISTS idx_receipts_business_date;
