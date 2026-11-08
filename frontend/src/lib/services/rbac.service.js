/**
 * Platform user service (super admin): account list, counts and platform roles via FastAPI
 * (/api/v1), suspend/unsuspend via the Next.js user-admin routes (Supabase admin API).
 */

import { PAGE_SIZE_MAX } from '@/lib/config';
import { apiClient } from './api-client';

// A suspension lasts until the super admin lifts it (Supabase needs a duration).
const SUSPEND_DURATION = '876000h';

function toQuery(params) {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
}

export async function getUserStats() {
  return apiClient.get('/v1/users/stats');
}

/** Users with their roles embedded (one request). Params: page, page_size, search, role, status. */
export async function listUsersWithRoles(params) {
  return apiClient.get(`/v1/users/with-roles?${toQuery(params)}`);
}

/** The platform role catalog (super_admin, admin, member). */
export async function listRoles() {
  return apiClient.get(`/v1/roles?page_size=${PAGE_SIZE_MAX}`);
}

/** Suspend an account: signed out everywhere, cannot sign in. */
export async function suspendUser(userId) {
  await apiClient.post(`/users/${userId}/ban`, { duration: SUSPEND_DURATION });
}

export async function unsuspendUser(userId) {
  await apiClient.post(`/users/${userId}/unban`);
}

/**
 * Switch an account's platform role (admin <-> member): grant the new role first, then drop
 * the old one, so the account is never left without a role. The backend refuses super_admin.
 */
export async function changePlatformRole(userId, toRoleId, fromRoleId) {
  await apiClient.post(`/v1/users/${userId}/roles`, { role_id: toRoleId });
  if (fromRoleId) await apiClient.delete(`/v1/users/${userId}/roles/${fromRoleId}`);
}
