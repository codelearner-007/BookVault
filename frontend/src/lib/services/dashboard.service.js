/**
 * Dashboard Service
 *
 * Handles dashboard statistics API calls
 */

import { apiClient } from './api-client';

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  return apiClient.get('/v1/dashboard/stats');
}
