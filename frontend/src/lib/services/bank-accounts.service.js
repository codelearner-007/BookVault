import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/bank-accounts`;

export async function listBankAccounts(businessId) {
  return apiClient.get(base(businessId));
}

export async function createBankAccount(businessId, data) {
  return apiClient.post(base(businessId), data);
}

export async function getBankAccount(businessId, bankAccountId) {
  return apiClient.get(`${base(businessId)}/${bankAccountId}`);
}

export async function updateBankAccount(businessId, bankAccountId, data) {
  return apiClient.put(`${base(businessId)}/${bankAccountId}`, data);
}

export async function deleteBankAccount(businessId, bankAccountId) {
  return apiClient.delete(`${base(businessId)}/${bankAccountId}`);
}
