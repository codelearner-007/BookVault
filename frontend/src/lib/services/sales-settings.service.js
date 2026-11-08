import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/settings/sales`;

export const CREDIT_LIMIT_POLICIES = { warn: 'warn', block: 'block' };

// { credit_limit_policy: 'warn' | 'block', version }
export async function getSalesSettings(businessId) {
  return apiClient.get(base(businessId));
}

export async function updateSalesSettings(businessId, body) {
  return apiClient.put(base(businessId), body);
}
