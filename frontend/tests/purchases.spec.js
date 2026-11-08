// Purchases end to end (B5): a purchase invoice with a 10% tax code entered and posted in the form, its
// Transaction Journal, a partial payment allocated to it in the payment form, then the invoice status and
// balance due, the supplier's Accounts payable, the Summary, and a debit note against the invoice.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL proxying /api/v1 to FastAPI.
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueSuffix } from './support/accounts';

const accounts = trackAccounts();
test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));

async function choose(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function pickParty(page, comboboxName, partyName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: partyName }).click();
}

async function ok(response) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('purchase invoice with tax, partial payment, status and AP, then a debit note', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const suffix = uniqueSuffix();
  const email = `purchases-owner-${suffix}@e2e.bookvault.dev`;
  const supplierName = `E2E Supplier ${suffix}`;
  const expenseName = `E2E Office supplies ${suffix}`;
  const bankName = `E2E Bank ${suffix}`;
  await accounts.createUser(page.request, email);

  // Setup through the API: a business with the purchase tabs, a supplier, an expense account, GST 10%, a bank.
  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const business = await ok(await calls.post('/api/v1/businesses', { name: `Purchases E2E ${suffix}`, books_start_date: '2026-01-01' }));
  accounts.addBusiness(email, business);
  const base = `/api/v1/businesses/${business.id}`;
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'payments', 'suppliers', 'purchase-invoices', 'debit-notes'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  const supplier = await ok(await calls.post(`${base}/suppliers`, { name: supplierName }));
  const expense = await ok(await calls.post(`${base}/chart-of-accounts/accounts`, { name: expenseName, type: 'expense' }));
  await ok(await calls.post(`${base}/tax-codes`, { name: 'GST', rate: '10' }));
  await ok(await calls.post(`${base}/bank-accounts`, { name: bankName }));

  // New purchase invoice in the form: 1 x 1,000 with GST 10% -> total 1,100 (computed by the server).
  await page.goto(`/admin/businesses/${business.id}?tab=purchase-invoices`);
  await page.getByRole('button', { name: 'New Purchase Invoice' }).click();
  await expect(page.getByRole('heading', { name: 'New Purchase Invoice' })).toBeVisible();
  await pickParty(page, 'Supplier', supplierName);
  await choose(page, 'Account, line 1', expenseName);
  await page.getByLabel('Qty, line 1').fill('1');
  await page.getByLabel('Unit price, line 1').fill('1000');
  await choose(page, 'Tax code, line 1', 'GST');
  await expect(page.getByText('1,100.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // The view: the Transaction Journal with the AP, expense and tax lines.
  await expect(page).toHaveURL(/tab=purchase-invoices&view=/);
  const invoiceUrl = page.url();
  const invoiceId = new URL(invoiceUrl).searchParams.get('view');
  const invoice = await ok(await calls.get(`${base}/purchase-invoices/${invoiceId}`));
  const journal = page.getByRole('region', { name: 'Transaction Journal' });
  await expect(journal.getByRole('row', { name: /Accounts payable/ })).toContainText('1,100.00');
  await expect(journal.getByRole('row', { name: new RegExp(expenseName) })).toContainText('1,000.00');
  await expect(journal.getByRole('row', { name: /Tax/ })).toContainText('100.00');

  // A partial payment of 600 in the form: an Accounts payable line for the supplier, paying this invoice.
  await page.goto(`/admin/businesses/${business.id}?tab=payments`);
  await page.getByRole('button', { name: 'New Payment' }).click();
  await expect(page.getByRole('heading', { name: 'New Payment' })).toBeVisible();
  await page.getByLabel('Paid from').click();
  await page.getByRole('option', { name: bankName, exact: true }).click();
  await choose(page, 'Account, line 1', 'Accounts payable');
  await pickParty(page, 'supplier, line 1', supplierName);
  await page.getByRole('combobox', { name: 'Purchase invoice, line 1' }).click();
  await page.getByRole('option', { name: new RegExp(`^${invoice.reference}`) }).click();
  await page.getByLabel('Amount, line 1').fill('600');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page).toHaveURL(/tab=payments&view=/);
  const allocations = page.getByRole('region', { name: 'Applied to invoices' });
  await expect(allocations.getByRole('row', { name: new RegExp(invoice.reference) })).toContainText('600.00');

  // Invoice: balance due 500, still unpaid; supplier AP 500; Summary shows Accounts payable 500.
  await page.goto(invoiceUrl);
  await expect(page.getByText('500.00').first()).toBeVisible();
  await expect(page.getByText(/Unpaid|Overdue/).first()).toBeVisible();
  await page.goto(`/admin/businesses/${business.id}?tab=suppliers`);
  await expect(page.getByRole('row', { name: new RegExp(supplierName) })).toContainText('500.00');
  await page.goto(`/admin/businesses/${business.id}?tab=summary`);
  await expect(page.getByRole('row', { name: /Accounts payable/ }).first()).toContainText('500.00');

  // Debit note of 100 linked to the invoice: balance due 400.
  const debit = await ok(await calls.post(`${base}/debit-notes`, {
    date: new Date().toISOString().slice(0, 10), supplier_id: supplier.id, invoice_id: invoiceId, post: true,
    lines: [{ account_id: expense.id, description: 'Return', unit_price: '100' }],
  }));
  expect(debit.applied[0].document_id).toBe(invoiceId);
  await page.goto(`/admin/businesses/${business.id}?tab=debit-notes&view=${debit.id}`);
  await expect(page.getByRole('region', { name: 'Transaction Journal' }).getByRole('row', { name: /Accounts payable/ }))
    .toContainText('100.00');
  await page.goto(invoiceUrl);
  await expect(page.getByText('400.00').first()).toBeVisible();
});
