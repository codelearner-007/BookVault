/**
 * Audit Service - API client for audit log management
 */

import { handleResponse } from './api-utils';

/**
 * List audit logs with pagination and filtering
 */
export async function listAuditLogs(params) {
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
