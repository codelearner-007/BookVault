import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { queryString } from './query-string';

const base = (businessId) => `/v1/businesses/${businessId}/late-payment-fees`;

// Same document flow as receipts: create (post flag), PUT, /post and /void with an Idempotency-Key.
export const latePaymentFeesService = {
  // The envelope also carries total_amount.
  list: (businessId, page = 1) => apiClient.get(`${base(businessId)}?${queryString({ page, page_size: PAGE_SIZE_DEFAULT })}`),
  get: (businessId, id) => apiClient.get(`${base(businessId)}/${id}`),
  create: (businessId, body, idempotencyKey) => apiClient.post(base(businessId), body, { idempotencyKey }),
  update: (businessId, id, body) => apiClient.put(`${base(businessId)}/${id}`, body),
  post: (businessId, id, version, idempotencyKey) =>
    apiClient.post(`${base(businessId)}/${id}/post`, { version }, { idempotencyKey }),
  void: (businessId, id, version, idempotencyKey) =>
    apiClient.post(`${base(businessId)}/${id}/void`, { version }, { idempotencyKey }),
  // Fees due on overdue invoices as at `asOf`: one row per invoice and charge date.
  proposals: (businessId, asOf) => apiClient.get(`${base(businessId)}/proposals?${queryString({ as_of: asOf })}`),
  // items: [{ invoice_id, charge_date }] -> { created: [fee] }
  confirmProposals: (businessId, items, idempotencyKey) =>
    apiClient.post(`${base(businessId)}/proposals/confirm`, { items }, { idempotencyKey }),
};
