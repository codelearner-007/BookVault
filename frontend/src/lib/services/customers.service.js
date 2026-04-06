import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/customers`;

export async function listCustomers(businessId) {
  return apiClient.get(base(businessId));
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

export async function deleteCustomer(businessId, customerId) {
  return apiClient.delete(`${base(businessId)}/${customerId}`);
}
