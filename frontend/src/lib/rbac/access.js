/**
 * Role-Based Access Control
 * Access is determined by user_role ('admin' | 'super_admin'), not permissions.
 */

/**
 * Admin modules available to all admin roles
 */
export const ADMIN_MODULES = [
  {
    key: 'dashboard',
    name: 'Dashboard',
    description: 'Admin dashboard overview',
  },
  {
    key: 'audit',
    name: 'Audit Logs',
    description: 'View system audit trail',
  },
];

/**
 * Modules restricted to super_admin role only
 */
export const SUPER_ADMIN_ONLY_MODULES = ['users'];

/**
 * Check if user can see the Admin nav entry
 */
export function canSeeAdminEntry(claims) {
  return claims?.user_role === 'admin' || claims?.user_role === 'super_admin';
}

/**
 * Check if user can access a specific admin module (view)
 */
export function canAccessAdminModule(claims, moduleKey) {
  return ADMIN_MODULES.some(m => m.key === moduleKey) && canSeeAdminEntry(claims);
}

/**
 * Check if user can edit in a specific admin module
 */
export function canEditAdminModule(claims, moduleKey) {
  return canAccessAdminModule(claims, moduleKey);
}

/**
 * Filter admin modules to only those the user can access
 */
export function getAccessibleAdminModules(claims) {
  if (!canSeeAdminEntry(claims)) return [];
  return ADMIN_MODULES;
}

/**
 * Assert that user has required role (for server-side gating)
 * Throws error if not authorized
 */
export function assertPermissions(claims, _required, errorMessage = 'Unauthorized') {
  if (!canSeeAdminEntry(claims)) {
    throw new Error(errorMessage);
  }
}
