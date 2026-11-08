import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { queryString } from './query-string';

const settingsPath = (businessId) => `/v1/businesses/${businessId}/settings/withholding-tax`;
const receiptsPath = (businessId) => `/v1/businesses/${businessId}/withholding-tax-receipts`;

export const WHT_BASES = { gross: 'gross', net: 'net' };

// { wht_receivable_enabled, wht_payable_enabled, wht_base: 'gross' | 'net', version }; every member may read it.
export async function getWithholdingTaxSettings(businessId) {
  return apiClient.get(settingsPath(businessId));
}

export async function updateWithholdingTaxSettings(businessId, body) {
  return apiClient.put(settingsPath(businessId), body);
}

// Withholding tax receipts (certificates from customers): the late-payment-fee document flow.
export const withholdingTaxReceiptsService = {
  // The envelope also carries total_amount.
  list: (businessId, page = 1) => apiClient.get(`${receiptsPath(businessId)}?${queryString({ page, page_size: PAGE_SIZE_DEFAULT })}`),
  get: (businessId, id) => apiClient.get(`${receiptsPath(businessId)}/${id}`),
  create: (businessId, body, idempotencyKey) => apiClient.post(receiptsPath(businessId), body, { idempotencyKey }),
  update: (businessId, id, body) => apiClient.put(`${receiptsPath(businessId)}/${id}`, body),
  post: (businessId, id, version, idempotencyKey) =>
    apiClient.post(`${receiptsPath(businessId)}/${id}/post`, { version }, { idempotencyKey }),
  void: (businessId, id, version, idempotencyKey) =>
    apiClient.post(`${receiptsPath(businessId)}/${id}/void`, { version }, { idempotencyKey }),
};
