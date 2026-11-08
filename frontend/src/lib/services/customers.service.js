import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { queryString } from './query-string';

const base = (businessId) => `/v1/businesses/${businessId}/customers`;

// One page of customers; the envelope also carries total_ar_balance.
export async function listCustomers(businessId, { page = 1, search = '' } = {}) {
  return apiClient.get(`${base(businessId)}?${queryString({ search, page, page_size: PAGE_SIZE_DEFAULT })}`);
}

export async function createCustomer(businessId, data, idempotencyKey) {
  return apiClient.post(base(businessId), data, { idempotencyKey });
}

export async function getCustomer(businessId, customerId) {
  return apiClient.get(`${base(businessId)}/${customerId}`);
}

export async function updateCustomer(businessId, customerId, data) {
  return apiClient.put(`${base(businessId)}/${customerId}`, data);
}

// 409 contact_in_use when the customer has transactions.
export async function deleteCustomer(businessId, customerId, version) {
  return apiClient.delete(`${base(businessId)}/${customerId}?version=${version}`);
}

// Documents that moved the customer's receivable; amount is the signed effect on it.
export async function listCustomerTransactions(businessId, customerId, page = 1) {
  return apiClient.get(`${base(businessId)}/${customerId}/transactions?${queryString({ page, page_size: PAGE_SIZE_DEFAULT })}`);
}

// Open invoices as at a date, oldest first, with any early payment discount still available.
export async function listOpenInvoices(businessId, customerId, asOf) {
  return apiClient.get(`${base(businessId)}/${customerId}/open-invoices?${queryString({ as_of: asOf })}`);
}
