/**
 * Audit Service - API client for audit log management
 */

import { handleResponse } from './api-utils';

export interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  module: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
}

export interface PaginatedAuditResponse {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AuditLogFilters {
  page: number;
  page_size: number;
  module?: string;
  action?: string;
  user_id?: string;
  start_date?: string; // ISO 8601 date string
  end_date?: string; // ISO 8601 date string
}

/**
 * List audit logs with pagination and filtering
 */
export async function listAuditLogs(params: AuditLogFilters): Promise<PaginatedAuditResponse> {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString();

  const response = await fetch(`/api/v1/audit/logs?${queryString}`, {
    credentials: 'include',
  });

  return handleResponse<PaginatedAuditResponse>(response);
}
