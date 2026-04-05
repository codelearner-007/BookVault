/**
 * Audit Service - API client for audit log management
 */

import { handleResponse } from './api-utils';

/**
 * List the current user's own audit logs with pagination and filtering.
 * The backend derives the user identity from the JWT token — never pass user_id here.
 *
 * Supported params: page, page_size, module, action, start_date, end_date
 */
export async function listMyAuditLogs(params) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

  const response = await fetch(`/api/v1/audit/logs?${queryString}`, {
    credentials: 'include',
  });

  return handleResponse(response);
}
