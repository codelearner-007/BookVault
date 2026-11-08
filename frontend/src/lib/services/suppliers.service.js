import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { queryString } from './query-string';

const base = (businessId) => `/v1/businesses/${businessId}/suppliers`;

// One page of suppliers; the envelope also carries total_ap_balance.
export async function listSuppliers(businessId, { page = 1, search = '' } = {}) {
  return apiClient.get(`${base(businessId)}?${queryString({ search, page, page_size: PAGE_SIZE_DEFAULT })}`);
}

export async function createSupplier(businessId, data, idempotencyKey) {
  return apiClient.post(base(businessId), data, { idempotencyKey });
}

export async function getSupplier(businessId, supplierId) {
  return apiClient.get(`${base(businessId)}/${supplierId}`);
}

export async function updateSupplier(businessId, supplierId, data) {
  return apiClient.put(`${base(businessId)}/${supplierId}`, data);
}

// 409 contact_in_use when the supplier has transactions.
export async function deleteSupplier(businessId, supplierId, version) {
  return apiClient.delete(`${base(businessId)}/${supplierId}?version=${version}`);
}

// Documents that moved the supplier's payable; amount is the signed effect on it (credit positive).
export async function listSupplierTransactions(businessId, supplierId, page = 1) {
  return apiClient.get(`${base(businessId)}/${supplierId}/transactions?${queryString({ page, page_size: PAGE_SIZE_DEFAULT })}`);
}

// Open purchase invoices, oldest first (closed invoices left out). Not dated: the API has no as_of here.
export async function listSupplierOpenInvoices(businessId, supplierId) {
  return apiClient.get(`${base(businessId)}/${supplierId}/open-invoices`);
}
