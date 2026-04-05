-- ============================================
-- Migration: Fix Audit Logs RLS Policies
-- Description: Remove the policy that allowed admins/super_admins to view
--              ALL audit log rows. After this migration, ALL users (including
--              admin and super_admin) can only SELECT rows where
--              auth.uid() = user_id, matching the existing "Users can view
--              own audit logs" policy.
-- Author: DB Migration Manager Agent
-- Date: 2026-04-06
-- ============================================

-- DROP the overly-permissive admin SELECT policy.
-- The "Users can view own audit logs" policy (auth.uid() = user_id) already
-- covers every role correctly, so no replacement policy is needed.
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

-- ============================================
-- Policies left intact (not touched by this migration):
--   SELECT  "Users can view own audit logs"           (auth.uid() = user_id)
--   INSERT  "Service role can insert audit logs"      (TO service_role)
--   INSERT  "Authenticated users can insert own audit logs"  (auth.uid() = user_id)
-- ============================================

-- Rollback instructions (run manually if needed):
-- CREATE POLICY "Admins can view audit logs"
--     ON public.audit_logs FOR SELECT
--     USING (
--         (current_setting('request.jwt.claims', true)::jsonb->>'user_role') IN ('admin', 'super_admin')
--     );
