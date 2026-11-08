import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/bank-accounts`;

// Every account plus coa_total (the balance of all accounts of the business).
export async function listBankAccounts(businessId) {
  return listAllPages(base(businessId));
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

export async function deleteBankAccount(businessId, bankAccountId, version) {
  return apiClient.delete(`${base(businessId)}/${bankAccountId}?version=${version}`);
}
