-- ==============================================
-- RBAC SEED DATA
-- Run after migrations to populate initial data
-- ==============================================

-- ==============================================
-- 1. ROLES
-- ==============================================
INSERT INTO public.roles (name, description, hierarchy_level, is_system) VALUES
    ('super_admin', 'Super Administrator with full system access', 10000, TRUE),
    ('admin', 'Admin user with access to the admin dashboard', 100, TRUE)
ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system;
