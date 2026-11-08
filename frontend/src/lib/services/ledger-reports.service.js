import { PAGE_SIZE_DEFAULT } from '@/lib/config';
import { apiClient } from './api-client';

const base = (businessId) => `/v1/businesses/${businessId}/reports`;

export async function getTrialBalance(businessId, asAt) {
  return apiClient.get(`${base(businessId)}/trial-balance?as_at=${asAt}`);
}

// filters: { from, to, accountId, includeReversed, page, pageSize }
export async function listGeneralLedgerTransactions(businessId, filters) {
  const query = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    include_reversed: String(Boolean(filters.includeReversed)),
    page: String(filters.page ?? 1),
    page_size: String(filters.pageSize ?? PAGE_SIZE_DEFAULT),
  });
  if (filters.accountId) query.set('account_id', filters.accountId);
  return apiClient.get(`${base(businessId)}/general-ledger-transactions?${query}`);
}

// Balance Sheet as at `to` and Profit and Loss for [from, to], every figure computed by the server.
export async function getSummary(businessId, from, to) {
  return apiClient.get(`${base(businessId)}/summary?${new URLSearchParams({ from, to })}`);
}
