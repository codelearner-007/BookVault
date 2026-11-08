/**
 * Audit Service - API client for audit log management
 */

import { apiClient } from './api-client';

function toQuery(params) {
  return new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();
}

/**
 * List the current user's own audit logs (paginated envelope).
 * The backend derives the user identity from the JWT token — never pass user_id here.
 *
 * Supported params: page, page_size, entity_type, action, start_date, end_date
 */
export async function listMyAuditLogs(params) {
  return apiClient.get(`/v1/audit/logs?${toQuery(params)}`);
}

/**
 * History of one business (paginated envelope, needs history:view).
 *
 * Supported params: page, page_size, entity_type, action, start_date, end_date
 */
export async function listBusinessHistory(businessId, params) {
  return apiClient.get(`/v1/businesses/${businessId}/history?${toQuery(params)}`);
}
