/**
 * Single Source of Truth for RBAC Access Control
 *
 * This file is the only place that binds permission strings to UI capabilities.
 * All permission checks and admin access logic should go through these functions.
 */

import { hasAnyPermission } from '@/lib/utils/rbac';

/**
 * Permissions that grant access to admin area at all
 * If user has ANY of these, they can see the "Admin" nav entry
 */
export const ADMIN_ENTRY_PERMISSIONS_ANY = [
  'roles:read',
  'roles:create',
  'roles:update',
  'roles:delete',
  'permissions:read',
  'permissions:create',
  'permissions:update',
  'permissions:delete',
  'users:read_all',
  'users:update_all',
  'users:delete_all',
  'users:assign_roles',
  'audit:read',
];

/**
 * Admin modules configuration
 */
export const ADMIN_MODULES = [
  {
    key: 'rbac',
    name: 'Roles & Permissions',
    description: 'Manage roles and assign permissions',
    viewPermissions: ['roles:read', 'permissions:read'],
    editPermissions: ['roles:create', 'roles:update', 'roles:delete', 'permissions:create', 'permissions:delete'],
  },
  {
    key: 'users',
    name: 'User Management',
    description: 'View users and assign roles',
    viewPermissions: ['users:read_all'],
    editPermissions: ['users:assign_roles', 'users:update_all', 'users:delete_all'],
  },
  {
    key: 'audit',
    name: 'Audit Logs',
    description: 'View system audit trail',
    viewPermissions: ['audit:read'],
  },
];

/**
 * Check if user can see the Admin nav entry
 */
export function canSeeAdminEntry(claims) {
  if (!claims || !claims.permissions) return false;
  return hasAnyPermission(claims.permissions, ADMIN_ENTRY_PERMISSIONS_ANY);
}

/**
 * Check if user can access a specific admin module (view)
 */
export function canAccessAdminModule(claims, moduleKey) {
  if (!claims || !claims.permissions) return false;

  const adminModule = ADMIN_MODULES.find(m => m.key === moduleKey);
  if (!adminModule) return false;

  return hasAnyPermission(claims.permissions, adminModule.viewPermissions);
}

/**
 * Check if user can edit in a specific admin module
 */
export function canEditAdminModule(claims, moduleKey) {
  if (!claims || !claims.permissions) return false;

  const adminModule = ADMIN_MODULES.find(m => m.key === moduleKey);
  if (!adminModule || !adminModule.editPermissions) return false;

  return hasAnyPermission(claims.permissions, adminModule.editPermissions);
}

/**
 * Filter admin modules to only those the user can access
 */
export function getAccessibleAdminModules(claims) {
  if (!claims) return [];

  return ADMIN_MODULES.filter(module =>
    canAccessAdminModule(claims, module.key)
  );
}

/**
 * Assert that user has required permissions (for server-side gating)
 * Throws error if not authorized
 */
export function assertPermissions(claims, required, errorMessage = 'Unauthorized') {
  if (!claims || !hasAnyPermission(claims.permissions, required)) {
    throw new Error(errorMessage);
  }
}
