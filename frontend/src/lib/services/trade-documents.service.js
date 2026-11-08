import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { queryString } from './query-string';

/*
  Sales quotes, orders, invoices, credit notes and delivery notes share one API shape; `resource` is the path.
  Create, post and void carry an Idempotency-Key (one per submit, reused when that submit is retried).
*/
export function tradeDocumentsService(resource) {
  const base = (businessId) => `/v1/businesses/${businessId}/${resource}`;
  return {
    // The envelope also carries total_amount (and total_balance_due on invoices).
    list: (businessId, { page = 1, search = '' } = {}) =>
      apiClient.get(`${base(businessId)}?${queryString({ search, page, page_size: PAGE_SIZE_DEFAULT })}`),
    get: (businessId, id) => apiClient.get(`${base(businessId)}/${id}`),
    create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
    update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
    // body: { version, credit_limit_override? }
    post: (businessId, id, body, idempotencyKey) => apiClient.post(`${base(businessId)}/${id}/post`, body, { idempotencyKey }),
    void: (businessId, id, version, idempotencyKey) =>
      apiClient.post(`${base(businessId)}/${id}/void`, { version }, { idempotencyKey }),
    // { target_type, prefill }: a create body for the target form, sent back with source_document_id.
    copyTo: (businessId, id, target) => apiClient.post(`${base(businessId)}/${id}/copy-to`, { target }),
    // Server-computed line amounts, tax and totals of unsaved lines; a read, so no Idempotency-Key.
    totals: (businessId, body) =>
      apiClient.request(`${base(businessId)}/totals`, { method: 'POST', body: JSON.stringify(body) }),
  };
}

// Invoices whose early payment discount window is still open as at `asOf`.
export async function listEarlyPaymentDiscounts(businessId, asOf, page = 1) {
  const params = queryString({ as_of: asOf, page, page_size: PAGE_SIZE_DEFAULT });
  return apiClient.get(`/v1/businesses/${businessId}/sales-invoices/early-payment-discounts?${params}`);
}
