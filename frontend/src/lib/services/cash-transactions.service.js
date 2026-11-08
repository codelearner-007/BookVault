import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

/*
  Receipts and payments share one API shape; `resource` is 'receipts' or 'payments'.
  Create, post and void carry an Idempotency-Key (one per submit, reused when that submit is retried).
*/
export function cashTransactionsService(resource) {
  const base = (businessId) => `/v1/businesses/${businessId}/${resource}`;
  return {
    // The envelope also carries total_amount (posted documents over the whole filtered list).
    list: (businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) =>
      apiClient.get(`${base(businessId)}?page=${page}&page_size=${pageSize}`),
    get: (businessId, id) => apiClient.get(`${base(businessId)}/${id}`),
    create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
    update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
    post: (businessId, id, version, idempotencyKey) =>
      apiClient.post(`${base(businessId)}/${id}/post`, { version }, { idempotencyKey }),
    void: (businessId, id, version, idempotencyKey) =>
      apiClient.post(`${base(businessId)}/${id}/void`, { version }, { idempotencyKey }),
    // Server-computed line amounts and total of unsaved lines; a read, so no Idempotency-Key.
    totals: (businessId, lines) =>
      apiClient.request(`${base(businessId)}/totals`, { method: 'POST', body: JSON.stringify({ lines }) }),
  };
}
