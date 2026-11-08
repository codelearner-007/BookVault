// Tax and withholding tax end to end (B7): a multiple-rate tax code made in the tax code form (State 10% to Tax
// payable, City 5% to a City tax payable account), a sales invoice at that code with 5% withholding tax
// (gross 230, WHT 11.50, Total 218.50), a withholding tax receipt for the 11.50, then the trial balance.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL proxying /api/v1 to FastAPI. With FastAPI on an isolated
// database set E2E_BACKEND_DB (tests/support/backend-db.js).
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueSuffix } from './support/accounts';
import { mirrorUser, removeMirroredUser } from './support/backend-db';
import { openTransactionJournal } from './support/documents';

const accounts = trackAccounts();
let mirrored = null;
test.afterEach(async ({ request, baseURL }) => {
  await accounts.cleanup(request, baseURL);
  if (mirrored) removeMirroredUser(mirrored);
  mirrored = null;
});

async function choose(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName, exact: true }).first().click();
}

// Click a button and return the JSON of the POST it sends to `path`, failing on an error status.
async function submit(page, buttonName, path) {
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(path));
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const response = await created;
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function ok(response) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('multi-rate tax code -> invoice with withholding tax -> withholding tax receipt -> trial balance', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const suffix = uniqueSuffix();
  const email = `tax-owner-${suffix}@e2e.bookvault.dev`;
  const customerName = `E2E Customer ${suffix}`;
  const incomeName = `E2E Service income ${suffix}`;
  const cityTaxName = `City tax payable ${suffix}`;
  const taxCodeName = `Sales tax ${suffix}`;
  const id = await accounts.createUser(page.request, email);
  mirrorUser(id, email);
  mirrored = id;

  // Setup through the API: tabs, withholding tax receivable on, a customer, an income and a City tax account.
  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const business = await ok(await calls.post('/api/v1/businesses', { name: `Tax E2E ${suffix}`, books_start_date: '2026-01-01' }));
  accounts.addBusiness(email, business);
  const base = `/api/v1/businesses/${business.id}`;
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'customers', 'sales-invoices', 'withholding-tax-receipts'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  const settings = await ok(await calls.get(`${base}/settings/withholding-tax`));
  await ok(await calls.put(`${base}/settings/withholding-tax`, { version: settings.version, wht_receivable_enabled: true }));
  const customer = await ok(await calls.post(`${base}/customers`, { name: customerName }));
  await ok(await calls.post(`${base}/chart-of-accounts/accounts`, { name: incomeName, type: 'income' }));
  await ok(await calls.post(`${base}/chart-of-accounts/accounts`, { name: cityTaxName, type: 'liability' }));

  // 1. Multiple-rate tax code in the form: State 10% (Tax payable by default) + City 5% (City tax payable).
  await page.goto(`/admin/businesses/${business.id}?tab=settings&page=tax-codes`);
  await page.getByRole('button', { name: 'New Tax Code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(taxCodeName);
  await choose(page, 'Type', 'Multiple rates');
  await dialog.getByLabel('Component 1 name').fill('State');
  await dialog.getByLabel('Component 1 rate').fill('10');
  await dialog.getByLabel('Component 2 name').fill('City');
  await dialog.getByLabel('Component 2 rate').fill('5');
  await choose(page, 'Component 2 account', cityTaxName);
  const taxCode = await submit(page, 'Save', '/tax-codes');
  expect([taxCode.type, taxCode.components.length]).toEqual(['multiple_rates', 2]);
  await expect(page.getByRole('row', { name: new RegExp(taxCodeName) })).toContainText('Multiple rates (2)');

  // 2. Sales invoice in the form: 1 x 200 at the code, withholding tax 5% of the total including tax.
  await page.goto(`/admin/businesses/${business.id}?tab=sales-invoices`);
  await page.getByRole('button', { name: 'New Sales Invoice' }).click();
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('option', { name: customerName }).click();
  await choose(page, 'Account, line 1', incomeName);
  await page.getByLabel('Qty, line 1').fill('1');
  await page.getByLabel('Unit price, line 1').fill('200');
  await choose(page, 'Tax code, line 1', taxCodeName);
  await page.getByLabel('Withholding tax', { exact: true }).check();
  await page.getByLabel('Withholding tax rate').fill('5');
  await expect(page.getByText('218.50').first()).toBeVisible();
  const invoice = await submit(page, 'Post', '/sales-invoices');
  expect([invoice.gross_total, invoice.withholding_tax.amount, invoice.total]).toEqual(['230.00', '11.50', '218.50']);

  // The view: Subtotal incl. tax 230, Withholding tax -11.50, Total 218.50; the journal has both tax components.
  await expect(page).toHaveURL(/tab=sales-invoices&view=/);
  await expect(page.getByRole('row', { name: /Subtotal incl\. tax/ })).toContainText('230.00');
  await expect(page.getByRole('row', { name: /^Withholding tax/ }).first()).toContainText('11.50');
  await expect(page.getByRole('row', { name: /^Total/ }).first()).toContainText('218.50');
  const journal = await openTransactionJournal(page);
  await expect(journal.getByRole('row', { name: /Tax payable/ })).toContainText('20.00');
  await expect(journal.getByRole('row', { name: new RegExp(cityTaxName) })).toContainText('10.00');
  await expect(journal.getByRole('row', { name: /Withholding tax receivable/ })).toContainText('11.50');

  // 3. Withholding tax receipt in the form for the 11.50 the customer withheld.
  await page.goto(`/admin/businesses/${business.id}?tab=withholding-tax-receipts`);
  await page.getByRole('button', { name: 'New Withholding Tax Receipt' }).click();
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('option', { name: customerName }).click();
  await page.getByLabel('Amount').fill('11.50');
  await page.getByLabel('Description').fill('Certificate');
  const receipt = await submit(page, 'Post', '/withholding-tax-receipts');
  expect([receipt.status, receipt.amount, receipt.customer_id]).toEqual(['posted', '11.50', customer.id]);
  await expect(page).toHaveURL(/tab=withholding-tax-receipts&view=/);
  await page.goto(`/admin/businesses/${business.id}?tab=withholding-tax-receipts`);
  await expect(page.getByRole('row', { name: new RegExp(customerName) })).toContainText('11.50');

  // 4. Trial balance: Tax payable Cr 20, City tax payable Cr 10, WHT receivable cleared, Withholding tax Dr 11.50.
  const asAt = new Date().toISOString().slice(0, 10);
  const trial = await ok(await calls.get(`${base}/reports/trial-balance?as_at=${asAt}`));
  const row = (name) => trial.rows.find((r) => r.account_name === name);
  expect(row('Tax payable')?.credit).toBe('20.00');
  expect(row(cityTaxName)?.credit).toBe('10.00');
  const receivable = row('Withholding tax receivable');
  if (receivable) expect([receivable.debit, receivable.credit]).toEqual(['0.00', '0.00']);
  expect(row('Withholding tax')?.debit).toBe('11.50');
});
