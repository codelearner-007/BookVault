/**
 * RBAC Service - API client for role and permission management
 *
 * Calls FastAPI backend via Next.js rewrites (/api/v1)
 * Uses frontend API routes only for auth operations (ban, delete, etc.)
 */

import { apiClient } from './api-client';

/**
 * List all roles
 */
export async function listRoles() {
  return apiClient.get('/v1/roles');
}

/**
 * Get role with permissions
 */
export async function getRoleWithPermissions(roleId) {
  return apiClient.get(`/v1/roles/${roleId}`);
}

/**
 * Get role permissions
 */
export async function getRolePermissions(roleId) {
  return apiClient.get(`/v1/roles/${roleId}/permissions`);
}

/**
 * Update role permissions (bulk replace)
 */
export async function updateRolePermissions(roleId, permissionIds) {
  return apiClient.put(`/v1/roles/${roleId}/permissions`, {
    permission_ids: permissionIds,
  });
}

/**
 * List all permissions grouped by module
 */
export async function listPermissionsGrouped() {
  return apiClient.get('/v1/permissions');
}

/**
 * Create a new role
 */
export async function createRole(data) {
  return apiClient.post('/v1/roles', data);
}

/**
 * Update a role
 */
export async function updateRole(roleId, data) {
  return apiClient.patch(`/v1/roles/${roleId}`, data);
}

/**
 * Delete a role
 */
export async function deleteRole(roleId) {
  return apiClient.delete(`/v1/roles/${roleId}`);
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Get user statistics
 */
export async function getUserStats() {
  return apiClient.get('/v1/users/stats');
}

/**
 * List users with roles embedded (single request, no N+1).
 */
export async function listUsersWithRoles(filters) {
  const queryString = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

  return apiClient.get(`/v1/users/with-roles?${queryString}`);
}

/**
 * Get user's assigned roles
 */
export async function getUserRoles(userId) {
  return apiClient.get(`/v1/users/${userId}/roles`);
}

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(userId, roleId) {
  return apiClient.post(`/v1/users/${userId}/roles`, { role_id: roleId });
}

/**
 * Remove a role from a user
 */
export async function removeRoleFromUser(userId, roleId) {
  return apiClient.delete(`/v1/users/${userId}/roles/${roleId}`);
}

/**
 * Ban a user (uses frontend API with Supabase admin client)
 */
export async function banUser(userId, duration = '8760h') {
  await apiClient.post(`/users/${userId}/ban`, { duration });
}

/**
 * Unban a user (uses frontend API with Supabase admin client)
 */
export async function unbanUser(userId) {
  await apiClient.post(`/users/${userId}/unban`);
}

/**
 * Delete a user permanently (uses frontend API with Supabase admin client)
 */
export async function deleteUser(userId) {
  await apiClient.delete(`/users/${userId}/delete`);
}

/**
 * Resend verification email to user (uses frontend API with Supabase admin client)
 */
export async function resendVerificationEmail(userId) {
  await apiClient.post(`/users/${userId}/resend-verification`);
}

/**
 * Send password reset email to user (uses frontend API with Supabase admin client)
 */
export async function sendPasswordResetEmail(userId) {
  await apiClient.post(`/users/${userId}/reset-password`);
}
