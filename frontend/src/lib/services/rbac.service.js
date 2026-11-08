/**
 * Platform user service (super admin): user stats/list via FastAPI (/api/v1),
 * account actions via the Next.js user-admin routes (ban, delete, etc.)
 */

import { apiClient } from './api-client';

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
 * Delete a business user the caller created (D-30); any other account answers 404 (D-34)
 */
export async function deleteUser(userId) {
  await apiClient.delete(`/users/${userId}`);
}

/**
 * Resend verification email to user (uses frontend API with Supabase admin client)
 */
export async function resendVerificationEmail(userId) {
  await apiClient.post(`/users/${userId}/resend-verification`);
}

/**
 * Reset the password of a business user the caller created (body: { password }, D-34)
 */
export async function sendPasswordResetEmail(userId, body) {
  await apiClient.post(`/users/${userId}/reset-password`, body);
}
