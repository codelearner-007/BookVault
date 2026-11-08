import { apiClient } from './api-client';
import { listAllPages } from './list-all-pages';

const base = (businessId) => `/v1/businesses/${businessId}/starting-balances/accounts`;

// Every balance-sheet account with its opening balance; the envelope also carries
// books_start_date, opening_date and retained_earnings_effect.
export async function listStartingBalances(businessId) {
  return listAllPages(base(businessId));
}

// side: 'debit' | 'credit'; amount '0' removes the opening balance.
export async function setStartingBalance(businessId, accountId, { side, amount }) {
  return apiClient.put(`${base(businessId)}/${accountId}`, { side, amount });
}
