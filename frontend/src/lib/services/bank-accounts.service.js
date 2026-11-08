import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/bank-accounts`;

// One page of accounts with their four balances; the envelope also carries `totals`.
export async function listBankAccounts(businessId, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  return apiClient.get(`${base(businessId)}?page=${page}&page_size=${pageSize}`);
}

// Every active account, for the Received in / Paid from selects.
export async function listActiveBankAccounts(businessId) {
  return listAllPages(`${base(businessId)}?include_inactive=false`);
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

// The account's register: documents that moved money in or out (received / paid / running balance),
// newest first; range = { from, to } ISO dates, either may be null (to defaults to today on the server).
export async function listBankAccountTransactions(businessId, bankAccountId, page = 1, range = {}, pageSize = PAGE_SIZE_DEFAULT) {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (range.from) query.set('date_from', range.from);
  if (range.to) query.set('date_to', range.to);
  return apiClient.get(`${base(businessId)}/${bankAccountId}/transactions?${query.toString()}`);
}
