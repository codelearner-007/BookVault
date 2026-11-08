// PR-78 end to end: a receipt posted without a bank account sits in Suspense; editing it to pick a bank
// account moves it out (reversal + repost); the bank's balance on the list opens its register, which lists it.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL proxying /api/v1 to FastAPI.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSWORD = 'correct horse battery staple';
const AMOUNT = '150.00';

function envLocal(name) {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

async function createConfirmedUser(request, email, password) {
  const key = envLocal('PRIVATE_SUPABASE_SERVICE_KEY');
  const response = await request.post(`${envLocal('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/admin/users`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    data: { email, password, email_confirm: true },
  });
  expect(response.ok()).toBeTruthy();
}

function api(page, baseURL) {
  const headers = { Origin: new URL(baseURL).origin, 'X-BookVault-Client': 'web' };
  const send = (method) => (path, data) => page.request.fetch(path, {
    method,
    data: data ?? {},
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  });
  return { post: send('POST'), put: send('PUT') };
}

async function expectSuspense(page, businessId, amount) {
  await page.goto(`/admin/businesses/${businessId}?tab=summary&suspense=1`);
  await expect(page.getByRole('heading', { name: 'Suspense', level: 1 })).toBeVisible();
  await expect(page.getByText('Suspense balance').locator('xpath=following-sibling::p')).toHaveText(amount);
}

test('receipt without a bank goes to Suspense, then picking a bank moves it to the register', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `suspense-owner-${suffix}@e2e.bookvault.dev`;
  const bankName = `E2E Bank ${suffix}`;
  const incomeName = `E2E Sales ${suffix}`;
  await createConfirmedUser(page.request, email, PASSWORD);

  await page.goto('/auth/login');
  const calls = api(page, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const created = await calls.post('/api/v1/businesses', { name: 'Suspense E2E' });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();
  const base = `/api/v1/businesses/${business.id}`;
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'bank-and-cash-accounts', 'receipts'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  expect((await calls.post(`${base}/bank-accounts`, { name: bankName })).ok()).toBeTruthy();
  expect((await calls.post(`${base}/chart-of-accounts/accounts`, { name: incomeName, type: 'income' })).ok()).toBeTruthy();

  // New receipt with no bank account: the form says where it goes, and it posts.
  await page.goto(`/admin/businesses/${business.id}?tab=receipts`);
  await page.getByRole('button', { name: 'New Receipt' }).click();
  await expect(page.getByText('No bank account: this will go to Suspense')).toBeVisible();
  await page.getByLabel('Description', { exact: true }).fill(`E2E suspense ${suffix}`);
  await page.getByRole('combobox', { name: 'Account, line 1' }).click();
  await page.getByRole('option', { name: incomeName, exact: true }).click();
  await page.getByLabel('Amount, line 1').fill('150');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page).toHaveURL(/tab=receipts&view=/);
  const receiptUrl = page.url();

  // Suspense shows the amount (credit-positive: a receipt debits Suspense).
  await expectSuspense(page, business.id, `-${AMOUNT}`);

  // Edit: pick the bank account; the note goes away and Update reposts.
  await page.goto(receiptUrl);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Received in').click();
  await page.getByRole('option', { name: bankName, exact: true }).click();
  await expect(page.getByText('No bank account: this will go to Suspense')).toBeHidden();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page).toHaveURL(/tab=receipts&view=/);
  await expect(page.getByRole('region', { name: 'Transaction Journal' }).getByText('Reversal', { exact: true })).toBeVisible();

  await expectSuspense(page, business.id, '0.00');
  await expect(page.getByText('Nothing in suspense')).toBeVisible();

  // The bank's balance on the list opens its register, which lists the receipt with its running balance.
  await page.goto(`/admin/businesses/${business.id}?tab=bank-and-cash-accounts`);
  await page.getByRole('button', { name: `Open the register of ${bankName}` }).click();
  await expect(page).toHaveURL(/register=/);
  const row = page.getByRole('row', { name: new RegExp(`E2E suspense ${suffix}`) });
  await expect(row).toContainText(AMOUNT);
  await expect(row.getByRole('cell').last()).toHaveText(AMOUNT);
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/tab=receipts&view=/);
});
