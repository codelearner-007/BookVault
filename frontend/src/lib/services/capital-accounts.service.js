import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/capital-accounts`;

export async function listCapitalAccounts(businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  return apiClient.get(`${base(businessId)}?page=${page}&page_size=${pageSize}`);
}

export async function createCapitalAccount(businessId, data) {
  return apiClient.post(base(businessId), data);
}

export async function updateCapitalAccount(businessId, id, data) {
  return apiClient.put(`${base(businessId)}/${id}`, data);
}

export async function deleteCapitalAccount(businessId, id, version) {
  return apiClient.delete(`${base(businessId)}/${id}?version=${version}`);
}
