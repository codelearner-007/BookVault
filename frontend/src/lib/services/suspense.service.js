import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/suspense`;

export async function getSuspenseBalance(businessId) {
  return apiClient.get(`${base(businessId)}/balance`);
}

export async function listSuspenseEntries(businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  return apiClient.get(`${base(businessId)}/entries?page=${page}&page_size=${pageSize}`);
}
