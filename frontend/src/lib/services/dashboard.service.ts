/**
 * Dashboard Service
 *
 * Handles dashboard statistics API calls
 */

import { handleResponse } from './api-utils';

export interface DashboardStats {
  total_roles: number;
  total_permissions: number;
  total_users: number;
  total_audit_logs: number;
  recent_activity_24h: number;
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await fetch('/api/v1/dashboard/stats', {
    credentials: 'include',
  });

  return handleResponse<DashboardStats>(response);
}
