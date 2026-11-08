import { apiClient } from './api-client';

/**
 * The workspace dashboard: a page of my businesses with the ledger figures I may view,
 * plus recent activity across all of them (GET /api/v1/me/dashboard).
 */
export async function getWorkspaceDashboard({ page = 1, pageSize, search } = {}) {
  const query = new URLSearchParams({ page: String(page) });
  if (pageSize) query.set('page_size', String(pageSize));
  if (search) query.set('search', search);
  return apiClient.get(`/v1/me/dashboard?${query}`);
}
