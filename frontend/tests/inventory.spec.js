// Inventory end to end (B6): an inventory item created in the form, bought on a purchase invoice (qty in at
// 50), sold on a sales invoice (COGS posted at the moving average), written off, transferred between locations
// (no journal), then the Inventory Items list shows the quantities and value.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL proxying /api/v1 to FastAPI. With FastAPI on an isolated
// database set E2E_BACKEND_DB (tests/support/backend-db.js).
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueSuffix } from './support/accounts';
import { mirrorUser, removeMirroredUser } from './support/backend-db';

const accounts = trackAccounts();
let mirrored = null;
test.afterEach(async ({ request, baseURL }) => {
  await accounts.cleanup(request, baseURL);
  if (mirrored) removeMirroredUser(mirrored);
  mirrored = null;
});

async function choose(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName }).first().click();
}

// Click a submit button and return the created document (the POST's JSON), failing on an error status.
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

test('item -> purchase -> sale with COGS -> write-off -> transfer -> quantities and value', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const suffix = uniqueSuffix();
  const email = `inventory-owner-${suffix}@e2e.bookvault.dev`;
  const id = await accounts.createUser(page.request, email);
  mirrorUser(id, email);
  mirrored = id;

  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const business = await ok(await calls.post('/api/v1/businesses', { name: `Inventory E2E ${suffix}`, books_start_date: '2026-01-01' }));
  accounts.addBusiness(email, business);
  const base = `/api/v1/businesses/${business.id}`;
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'customers', 'suppliers', 'sales-invoices', 'purchase-invoices', 'inventory-items',
      'inventory-transfers', 'inventory-write-offs'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  const supplier = await ok(await calls.post(`${base}/suppliers`, { name: `E2E Supplier ${suffix}` }));
  const customer = await ok(await calls.post(`${base}/customers`, { name: `E2E Customer ${suffix}` }));
  const store = await ok(await calls.post(`${base}/inventory-locations`, { name: 'Warehouse 2' }));

  // 1. Inventory item in the form.
  await page.goto(`/admin/businesses/${business.id}?tab=inventory-items&new=1`);
  await page.getByLabel('Item code').fill('W1');
  await page.getByLabel('Item name').fill('Widget');
  const item = await submit(page, 'Create', '/inventory-items');

  // 2. Purchase invoice in the form: 10 x 50, also a goods receipt -> qty owned and on hand 10.
  await page.goto(`/admin/businesses/${business.id}?tab=purchase-invoices`);
  await page.getByRole('button', { name: 'New Purchase Invoice' }).click();
  await page.getByRole('combobox', { name: 'Supplier' }).click();
  await page.getByRole('option', { name: supplier.name }).click();
  await choose(page, 'Item, line 1', 'Widget');
  await page.getByLabel('Qty, line 1').fill('10');
  await page.getByLabel('Unit price, line 1').fill('50');
  await page.getByLabel('Also acts as goods receipt').check();
  const bill = await submit(page, 'Post', '/purchase-invoices');
  expect(bill.total).toBe('500.00');

  // 3. Sales invoice in the form: 4 x 100 -> COGS 4 x 50 = 200 as its own journal entry.
  await page.goto(`/admin/businesses/${business.id}?tab=sales-invoices`);
  await page.getByRole('button', { name: 'New Sales Invoice' }).click();
  await page.getByRole('combobox', { name: 'Customer' }).click();
  await page.getByRole('option', { name: customer.name }).click();
  await choose(page, 'Item, line 1', 'Widget');
  await page.getByLabel('Qty, line 1').fill('4');
  await page.getByLabel('Unit price, line 1').fill('100');
  await page.getByLabel('Also acts as delivery note').check();
  const invoice = await submit(page, 'Post', '/sales-invoices');
  expect(invoice.total).toBe('400.00');
  const journal = await ok(await calls.get(`${base}/documents/${invoice.id}/journal`));
  const cogs = journal.entries.filter((e) => e.source === 'cogs').flatMap((e) => e.lines);
  expect(cogs.map((l) => [l.debit, l.credit]).sort()).toEqual([['0.00', '200.00'], ['200.00', '0.00']]);

  // 4. Write-off of 1 at the average (50).
  await page.goto(`/admin/businesses/${business.id}?tab=inventory-write-offs&new=1`);
  await choose(page, 'Item, line 1', 'Widget');
  await page.getByLabel('Qty, line 1').fill('1');
  const writeOff = await submit(page, 'Post', '/inventory-write-offs');
  expect(writeOff.total_cost).toBe('50.00');

  // 5. Transfer 2 to Warehouse 2: no journal.
  await page.goto(`/admin/businesses/${business.id}?tab=inventory-transfers&new=1`);
  await choose(page, 'From location', 'Default Inventory Location');
  await choose(page, 'To location', store.name);
  await choose(page, 'Item, line 1', 'Widget');
  await page.getByLabel('Qty, line 1').fill('2');
  const transfer = await submit(page, 'Post', '/inventory-transfers');
  expect((await ok(await calls.get(`${base}/documents/${transfer.id}/journal`))).entries).toEqual([]);

  // 6. List: owned 5, on hand 5, value 250 at average 50; per location 3 + 2.
  await page.goto(`/admin/businesses/${business.id}?tab=inventory-items`);
  const row = page.getByTestId('inventory-items-table').getByRole('row').filter({ hasText: 'Widget' });
  await expect(row).toContainText('250.00');
  await expect(row).toContainText('50.00');
  const detail = await ok(await calls.get(`${base}/inventory-items/${item.id}`));
  expect([detail.qty_owned, detail.qty_on_hand, detail.total_cost]).toEqual(['5.0000', '5.0000', '250.00']);
  expect(Object.fromEntries(detail.locations.map((l) => [l.location_name, l.qty_on_hand])))
    .toEqual({ 'Default Inventory Location': '3.0000', 'Warehouse 2': '2.0000' });
});
