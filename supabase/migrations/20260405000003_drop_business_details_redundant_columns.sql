-- ============================================
-- Migration: Drop Redundant Columns from business_details
-- Description: Removes `name` and `country` from business_details.
--              Both columns duplicate data already stored in the parent
--              `businesses` table (3NF violation). They are nullable TEXT
--              columns with no indexes, no backend reads/writes, and no
--              frontend references — safe to drop with no data loss risk.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-05
-- ============================================

-- Section 1: Drop Redundant Columns
ALTER TABLE public.business_details DROP COLUMN IF EXISTS name;
ALTER TABLE public.business_details DROP COLUMN IF EXISTS country;

-- ============================================
-- ROLLBACK (run manually if needed)
-- ============================================
-- ALTER TABLE public.business_details ADD COLUMN IF NOT EXISTS name    TEXT;
-- ALTER TABLE public.business_details ADD COLUMN IF NOT EXISTS country TEXT;
