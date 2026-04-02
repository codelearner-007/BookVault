/**
 * Dashboard Service
 *
 * Handles dashboard statistics API calls
 */

import { handleResponse } from './api-utils';

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const response = await fetch('/api/v1/dashboard/stats', {
    credentials: 'include',
  });

  return handleResponse(response);
}
