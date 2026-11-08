// Chart of accounts and Summary end to end (B2): add a balance-sheet account with a starting balance
// through the account form, then see it in the Summary with a balanced Balance Sheet. Needs the local
// stack, FastAPI on :8000 and Next.js on :3000 (PLAYWRIGHT_BASE_URL=http://localhost:3000).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSWORD = 'correct horse battery staple';
const BOOKS_START = '2026-01-01';
const OPENING_DATE = '2025-12-31'; // books_start_date - 1 (posting-rules §10)
const AMOUNT = '400.00';

function envLocal(name) {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Today as YYYY-MM-DD in the local time zone (what the app defaults to).
function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

async function login(page, calls, email) {
  await page.goto('/auth/login');
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
}

function rowOf(table, name) {
  return table.getByRole('row', { name });
}

test('add an account with a starting balance and see it in a balanced Summary', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const email = `coa-owner-${suffix}@e2e.bookvault.dev`;
  const accountName = `E2E Prepaid ${suffix}`;
  const accountRow = new RegExp(`^${accountName}`);
  await createConfirmedUser(page.request, email, PASSWORD);

  const calls = api(page, baseURL);
  await login(page, calls, email);
  const created = await calls.post('/api/v1/businesses', { name: 'Chart E2E', books_start_date: BOOKS_START });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();

  // Settings -> Chart of Accounts.
  await page.goto(`/admin/businesses/${business.id}?tab=settings`);
  await page.getByRole('link', { name: /Chart of Accounts/ }).click();
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();

  // New balance-sheet account under Assets with a Debit starting balance.
  await page.getByRole('button', { name: 'New Account' }).click();
  await page.getByRole('menuitem', { name: 'Balance Sheet' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Account' });
  await dialog.getByLabel('Account Name').fill(accountName);
  await expect(dialog.getByRole('combobox', { name: 'Group' })).toHaveText(/Assets/);
  await expect(dialog.getByText(`Opening balance dated ${OPENING_DATE}`)).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Starting balance side' }).click();
  await page.getByRole('option', { name: 'Debit', exact: true }).click();
  await dialog.getByLabel('Starting balance amount').fill(AMOUNT);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  const chart = page.getByRole('table', { name: 'Balance Sheet' });
  await expect(rowOf(chart, accountRow)).toContainText(AMOUNT);

  // Summary for the year to date: the account, both totals and retained earnings at 400.00.
  await page.goto(`/admin/businesses/${business.id}?tab=summary&from=${BOOKS_START}&to=${todayIso()}`);
  const sheet = page.getByRole('table', { name: 'Balance Sheet' });
  await expect(rowOf(sheet, accountRow)).toContainText(AMOUNT);
  await expect(rowOf(sheet, /^Total assets/)).toContainText(AMOUNT);
  await expect(rowOf(sheet, /^Total liabilities and equity/)).toContainText(AMOUNT);
  await expect(rowOf(sheet, /^Retained earnings/)).toContainText(AMOUNT);
  await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
});
