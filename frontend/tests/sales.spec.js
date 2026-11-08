// Sales end to end (B4): an invoice with a 10% tax code entered and posted in the form, its Transaction Journal,
// a partial receipt against it, then the invoice status and balance due, the customer's Accounts receivable,
// the Summary, and a credit note against the invoice.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL proxying /api/v1 to FastAPI.
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueSuffix } from './support/accounts';

const accounts = trackAccounts();
test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));

async function choose(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function ok(response) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('invoice with tax, partial receipt, status and AR, then a credit note', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const suffix = uniqueSuffix();
  const email = `sales-owner-${suffix}@e2e.bookvault.dev`;
  const customerName = `E2E Customer ${suffix}`;
  const incomeName = `E2E Service income ${suffix}`;
  await accounts.createUser(page.request, email);

  // Setup through the API: a business with the sales tabs, a customer, an income account, GST 10%, a bank.
  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const business = await ok(await calls.post('/api/v1/businesses', { name: 'Sales E2E', books_start_date: '2026-01-01' }));
  accounts.addBusiness(email, business);
  const base = `/api/v1/businesses/${business.id}`;
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'receipts', 'customers', 'sales-invoices', 'credit-notes'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  const customer = await ok(await calls.post(`${base}/customers`, { name: customerName }));
  const income = await ok(await calls.post(`${base}/chart-of-accounts/accounts`, { name: incomeName, type: 'income' }));
  await ok(await calls.post(`${base}/tax-codes`, { name: 'GST', rate: '10' }));
  const bank = await ok(await calls.post(`${base}/bank-accounts`, { name: `E2E Bank ${suffix}` }));

  // New sales invoice in the form: 1 x 1,000 with GST 10% -> total 1,100 (computed by the server).
  await page.goto(`/admin/businesses/${business.id}?tab=sales-invoices`);
  await page.getByRole('button', { name: 'New Sales Invoice' }).click();
  await expect(page.getByRole('heading', { name: 'New Sales Invoice' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('option', { name: customerName }).click();
  await choose(page, 'Account, line 1', incomeName);
  await page.getByLabel('Qty, line 1').fill('1');
  await page.getByLabel('Unit price, line 1').fill('1000');
  await choose(page, 'Tax code, line 1', 'GST');
  await expect(page.getByText('1,100.00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // The view: total, balance due, Transaction Journal with the AR, income and tax lines.
  await expect(page).toHaveURL(/tab=sales-invoices&view=/);
  const invoiceUrl = page.url();
  const invoiceId = new URL(invoiceUrl).searchParams.get('view');
  const journal = page.getByRole('region', { name: 'Transaction Journal' });
  await expect(journal.getByRole('row', { name: /Accounts receivable/ })).toContainText('1,100.00');
  await expect(journal.getByRole('row', { name: new RegExp(incomeName) })).toContainText('1,000.00');
  await expect(journal.getByRole('row', { name: /Tax payable/ })).toContainText('100.00');

  // A partial receipt of 600 against the invoice (Accounts receivable line, Automatic allocation).
  const tree = await ok(await calls.get(`${base}/chart-of-accounts/tree?as_at=2100-12-31&include_hidden=true`));
  const nodes = (list) => list.flatMap((n) => [n, ...nodes(n.groups)]);
  const ar = nodes(tree.roots).flatMap((n) => n.accounts).find((a) => a.system_account_code === 'accounts_receivable');
  const receipt = await ok(await calls.post(`${base}/receipts`, {
    date: new Date().toISOString().slice(0, 10), bank_account_id: bank.id, counterparty_party_id: customer.id, post: true,
    lines: [{ account_id: ar.id, party_id: customer.id, unit_price: '600' }],
  }));
  expect(receipt.allocations[0].invoice_id).toBe(invoiceId);

  // Invoice: balance due 500, still unpaid; customer AR 500; Summary shows Accounts receivable 500.
  await page.goto(invoiceUrl);
  await expect(page.getByText('500.00').first()).toBeVisible();
  await expect(page.getByText(/Unpaid|Overdue/).first()).toBeVisible();
  await page.goto(`/admin/businesses/${business.id}?tab=customers`);
  await expect(page.getByRole('row', { name: new RegExp(customerName) })).toContainText('500.00');
  await page.goto(`/admin/businesses/${business.id}?tab=summary`);
  await expect(page.getByRole('row', { name: /Accounts receivable/ }).first()).toContainText('500.00');

  // Credit note of 100 linked to the invoice: balance due 400.
  const credit = await ok(await calls.post(`${base}/credit-notes`, {
    date: new Date().toISOString().slice(0, 10), customer_id: customer.id, invoice_id: invoiceId, post: true,
    lines: [{ account_id: income.id, description: 'Return', unit_price: '100' }],
  }));
  expect(credit.applied[0].document_id).toBe(invoiceId);
  await page.goto(`/admin/businesses/${business.id}?tab=credit-notes&view=${credit.id}`);
  await expect(page.getByRole('region', { name: 'Transaction Journal' }).getByRole('row', { name: /Accounts receivable/ }))
    .toContainText('100.00');
  await page.goto(invoiceUrl);
  await expect(page.getByText('400.00').first()).toBeVisible();
});
