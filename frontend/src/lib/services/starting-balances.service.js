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

const bankBase = (businessId) => `/v1/businesses/${businessId}/starting-balances/bank-accounts`;

// Every bank or cash account with its opening balance (same envelope extras as above).
export async function listBankStartingBalances(businessId) {
  return listAllPages(bankBase(businessId));
}

export async function setBankStartingBalance(businessId, bankAccountId, { side, amount }) {
  return apiClient.put(`${bankBase(businessId)}/${bankAccountId}`, { side, amount });
}

const invoiceBase = (businessId) => `/v1/businesses/${businessId}/starting-balances/sales-invoices`;

// Starting-balance sales invoices; the envelope also carries books_start_date and opening_date.
export async function listStartingBalanceInvoices(businessId) {
  return listAllPages(invoiceBase(businessId));
}

export async function setPaidBeforeStart(businessId, invoiceId, paidBeforeStart) {
  return apiClient.put(`${invoiceBase(businessId)}/${invoiceId}`, { paid_before_start: paidBeforeStart });
}
