-- ==============================================
-- RBAC SEED DATA
-- Run after migrations to populate initial data
-- ==============================================

-- ==============================================
-- 1. ROLES
-- ==============================================
INSERT INTO public.roles (name, description, hierarchy_level, is_system) VALUES
    ('super_admin', 'Super Administrator with full system access', 10000, TRUE),
    ('user', 'Regular user with basic permissions', 100, TRUE)
ON CONFLICT (name) DO UPDATE SET is_system = EXCLUDED.is_system;

-- ==============================================
-- 2. PERMISSIONS (Auth & RBAC Modules)
-- ==============================================
INSERT INTO public.permissions (module, action, description) VALUES
    -- Users Module
    ('users', 'read_all', 'View all users'),
    ('users', 'update_all', 'Update all users'),
    ('users', 'delete_all', 'Delete users'),
    ('users', 'assign_roles', 'Assign roles to users'),

    -- Roles Module
    ('roles', 'create', 'Create new roles'),
    ('roles', 'read', 'View roles'),
    ('roles', 'update', 'Update roles'),
    ('roles', 'delete', 'Delete roles'),

    -- Permissions Module
    ('permissions', 'create', 'Create new permissions'),
    ('permissions', 'read', 'View permissions'),
    ('permissions', 'update', 'Update permissions'),
    ('permissions', 'delete', 'Delete permissions'),

    -- Audit Module
    ('audit', 'read', 'View audit logs')
ON CONFLICT (module, action) DO NOTHING;

-- ==============================================
-- 3. ROLE PERMISSIONS ASSIGNMENT
-- ==============================================

-- Super Admin: ALL permissions (current + future via trigger)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- User: No admin permissions (profile operations use direct auth, not RBAC)
-- The 'user' role exists as a base role with no special permissions.
