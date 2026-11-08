import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/customers`;

export async function listCustomers(businessId) {
  return listAllPages(base(businessId));
}

export async function createCustomer(businessId, data) {
  return apiClient.post(base(businessId), data);
}

export async function getCustomer(businessId, customerId) {
  return apiClient.get(`${base(businessId)}/${customerId}`);
}

export async function updateCustomer(businessId, customerId, data) {
  return apiClient.put(`${base(businessId)}/${customerId}`, data);
}

export async function deleteCustomer(businessId, customerId, version) {
  return apiClient.delete(`${base(businessId)}/${customerId}?version=${version}`);
}

export async function listCustomerReceipts(businessId, customerId) {
  return listAllPages(`${base(businessId)}/${customerId}/receipts`);
}
