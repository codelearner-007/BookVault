// Banking end to end (B3): a receipt with two lines into a bank account, posted, seen in its Transaction Journal,
// the bank account's Actual balance and the Summary's Cash & cash equivalents; then voided and the balance is back.
// Needs the local stack: Next.js at PLAYWRIGHT_BASE_URL (e.g. http://localhost:3020) proxying /api/v1 to FastAPI.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSWORD = 'correct horse battery staple';
const LINE_AMOUNTS = ['100.25', '25.25'];
const TOTAL = '125.50';
const ZERO = '0.00';

function envLocal(name) {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createConfirmedUser(request, email, password) {
  const key = envLocal('PRIVATE_SUPABASE_SERVICE_KEY');
  const response = await request.post(`${envLocal('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/admin/users`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    data: { email, password, email_confirm: true },
  });
  expect(response.ok()).toBeTruthy();
}

// Same-origin calls with the CSRF headers the routes require; creates carry an Idempotency-Key.
function api(page, baseURL) {
  const headers = { Origin: new URL(baseURL).origin, 'X-BookVault-Client': 'web' };
  const send = (method) => (path, data) => page.request.fetch(path, {
    method,
    data: data ?? {},
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  });
  return { post: send('POST'), put: send('PUT') };
}

async function choose(page, comboboxName, optionName) {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

async function expectActualBalance(page, businessId, bankName, amount) {
  await page.goto(`/admin/businesses/${businessId}?tab=bank-and-cash-accounts`);
  const row = page.getByRole('row', { name: new RegExp(bankName) });
  // Columns: Name, Cleared balance, Pending deposits, Pending withdrawals, Actual balance.
  await expect(row.getByRole('cell').last()).toHaveText(amount);
}

test('post a two-line receipt, see it in the journal, bank balance and summary, then void it', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const suffix = uniqueSuffix();
  const email = `bank-owner-${suffix}@e2e.bookvault.dev`;
  const bankName = `E2E Bank ${suffix}`;
  const incomeAccounts = [`E2E Sales ${suffix}`, `E2E Interest ${suffix}`];
  await createConfirmedUser(page.request, email, PASSWORD);

  // Setup through the API: sign in, a business with the banking tabs on, a bank account, two income accounts.
  await page.goto('/auth/login');
  const calls = api(page, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const created = await calls.post('/api/v1/businesses', { name: 'Banking E2E' });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();
  const base = `/api/v1/businesses/${business.id}`;
  // A write right after the create can land before the create is visible (404); retry briefly.
  await expect.poll(async () => (await calls.put(`${base}/tabs`, {
    items: ['summary', 'bank-and-cash-accounts', 'receipts'].map((key) => ({ key, enabled: true })),
  })).status()).toBe(200);
  const bank = await calls.post(`${base}/bank-accounts`, { name: bankName });
  expect(bank.ok(), await bank.text()).toBeTruthy();
  for (const name of incomeAccounts) {
    const account = await calls.post(`${base}/chart-of-accounts/accounts`, { name, type: 'income' });
    expect(account.ok(), await account.text()).toBeTruthy();
  }
  await expectActualBalance(page, business.id, bankName, ZERO);

  // New receipt: two lines; the line totals and the total come back from the server.
  await page.goto(`/admin/businesses/${business.id}?tab=receipts`);
  await page.getByRole('button', { name: 'New Receipt' }).click();
  await expect(page.getByRole('heading', { name: 'New Receipt' })).toBeVisible();
  await page.getByLabel('Received in').click();
  await page.getByRole('option', { name: bankName, exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill(`E2E receipt ${suffix}`);
  await page.getByRole('button', { name: 'Add line' }).click();
  for (const [index, accountName] of incomeAccounts.entries()) {
    await choose(page, `Account, line ${index + 1}`, accountName);
    await page.getByLabel(`Amount, line ${index + 1}`).fill(LINE_AMOUNTS[index]);
  }
  await expect(page.getByText(TOTAL, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // The view: the server total, and the Transaction Journal debiting the bank account.
  await expect(page).toHaveURL(/tab=receipts&view=/);
  const receiptUrl = page.url();
  await expect(page.getByRole('heading', { name: /^Receipt/, level: 1 })).toBeVisible();
  await expect(page.getByTestId('document-total')).toHaveText(TOTAL);
  const journal = page.getByRole('region', { name: 'Transaction Journal' });
  await expect(journal.getByText('Original', { exact: true })).toBeVisible();
  await expect(journal.getByRole('row', { name: new RegExp(bankName) })).toContainText(TOTAL);

  // The bank account's Actual balance went up by the total.
  await expectActualBalance(page, business.id, bankName, TOTAL);

  // The Summary shows the Cash & cash equivalents increase.
  await page.goto(`/admin/businesses/${business.id}?tab=summary`);
  await expect(page.getByRole('row', { name: /Cash & cash equivalents/ }).first()).toContainText(TOTAL);

  // Void the receipt: a reversal is posted and the balance is back to zero.
  await page.goto(receiptUrl);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Void' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Void' }).click();
  await expect(journal.getByText('Reversal', { exact: true })).toBeVisible();
  await expectActualBalance(page, business.id, bankName, ZERO);
});
