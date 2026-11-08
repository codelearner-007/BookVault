import { apiClient } from './api-client';

export const PARTY_KINDS = { customer: 'customer', supplier: 'supplier', capitalAccount: 'capital_account' };
const SEARCH_PAGE_SIZE = 20;

// Customers, suppliers or capital accounts matching `query`; first page only, the picker searches.
export async function searchParties(businessId, kind, query = '') {
  const params = new URLSearchParams({ kind, q: query, page: '1', page_size: String(SEARCH_PAGE_SIZE) });
  return apiClient.get(`/v1/businesses/${businessId}/parties?${params}`);
}
