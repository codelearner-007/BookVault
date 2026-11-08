import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/inter-account-transfers`;

// The envelope also carries total_amount.
export async function listTransfers(businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  return apiClient.get(`${base(businessId)}?page=${page}&page_size=${pageSize}`);
}

export async function getTransfer(businessId, id) {
  return apiClient.get(`${base(businessId)}/${id}`);
}

export async function createTransfer(businessId, body, idempotencyKey) {
  return apiClient.post(base(businessId), body, { idempotencyKey });
}

export async function updateTransfer(businessId, id, body) {
  return apiClient.put(`${base(businessId)}/${id}`, body);
}

export async function postTransfer(businessId, id, version, idempotencyKey) {
  return apiClient.post(`${base(businessId)}/${id}/post`, { version }, { idempotencyKey });
}

export async function voidTransfer(businessId, id, version, idempotencyKey) {
  return apiClient.post(`${base(businessId)}/${id}/void`, { version }, { idempotencyKey });
}
