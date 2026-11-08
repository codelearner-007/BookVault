// Business members end to end (B0.3 UI): the owner adds a user with a custom access grid,
// the user signs in and sees only the granted tabs. Needs the local stack, FastAPI on :8000
// and Next.js on :3000 (PLAYWRIGHT_BASE_URL=http://localhost:3000).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSWORD = 'correct horse battery staple';
const MEMBER_PASSWORD = 'another long passphrase here';

function envLocal(name) {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.bookvault.dev`;
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

async function loginUi(page, email, password) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();
}

test('owner adds a user with a custom grid; the user sees only the granted tabs', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const ownerEmail = uniqueEmail('owner');
  const memberEmail = uniqueEmail('member');
  await createConfirmedUser(page.request, ownerEmail, PASSWORD);

  // Setup through the API: sign in, a business with Customers and Suppliers turned on.
  await page.goto('/auth/login');
  const calls = api(page, baseURL);
  expect((await calls.post('/api/auth/login', { email: ownerEmail, password: PASSWORD })).ok()).toBeTruthy();
  const created = await calls.post('/api/v1/businesses', { name: 'Members E2E' });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();
  // A write right after the create can land before the create is visible (404); retry briefly.
  await expect.poll(async () => (await calls.put(`/api/v1/businesses/${business.id}/tabs`, {
    items: [{ key: 'customers', enabled: true }, { key: 'suppliers', enabled: true }],
  })).status()).toBe(200);

  // UI under test: Members -> Add user with View on Customers only.
  await page.goto(`/admin/businesses/${business.id}?page=members`);
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  await page.getByRole('link', { name: 'Add user' }).click();
  await expect(page.getByRole('heading', { name: 'Add user' })).toBeVisible();
  await page.getByLabel('Name').fill('Grid Member');
  await page.getByLabel('Email').fill(memberEmail);
  await page.getByLabel('Password', { exact: true }).fill(MEMBER_PASSWORD);
  await page.getByRole('switch', { name: /must change password/i }).click();
  await expect(page.getByRole('switch', { name: 'Full access' })).not.toBeChecked();
  // Create ticks View; unticking View clears the row.
  await page.getByRole('checkbox', { name: 'Create Suppliers' }).check();
  await expect(page.getByRole('checkbox', { name: 'View Suppliers' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'View Suppliers' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Create Suppliers' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'View Customers' }).check();
  await page.getByRole('button', { name: 'Add user' }).click();

  await expect(page).toHaveURL(/page=members$/);
  const row = page.getByRole('row', { name: /Grid Member/ });
  await expect(row).toContainText('Custom');
  await expect(row).toContainText('Active');

  // The member signs in (own browser context) and sees Customers but not Suppliers.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await loginUi(memberPage, memberEmail, MEMBER_PASSWORD);
  await expect(memberPage).toHaveURL(/\/admin/);
  await memberPage.goto(`/admin/businesses/${business.id}`);
  const nav = memberPage.getByRole('navigation').filter({ has: memberPage.getByRole('link', { name: 'Customers' }) });
  await expect(nav.getByRole('link', { name: 'Customers' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Suppliers' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Summary' })).toHaveCount(0);
  await memberContext.close();
});
