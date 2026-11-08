// One interface for admins and the super admin (2026-11-08): the same sidebar, plus one
// "Admin Panel" tab for the super admin only. Needs the local stack (Docker DB container
// supabase_db_BookVault), FastAPI on :8000 and Next.js (PLAYWRIGHT_BASE_URL).
import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PASSWORD, trackAccounts, uniqueEmail } from './support/accounts';

const DB_CONTAINER = process.env.TEST_DB_CONTAINER || 'supabase_db_BookVault';
const TOTP_STEP_SECONDS = 30;
const WORKSPACE_ITEMS = ['Dashboard', 'Businesses', 'Audit logs', 'Account'];

const accounts = trackAccounts();
test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Test setup only: the platform has no UI that creates a super admin.
function promoteToSuperAdmin(userId) {
  const sql = `UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE name = 'super_admin') WHERE user_id = '${userId}'`;
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

function api(page) {
  const headers = { Origin: new URL(page.url()).origin, 'X-BookVault-Client': 'web' };
  return { post: (path, data) => page.request.post(path, { data: data ?? {}, headers }) };
}

async function loginUi(page, email) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^log in$/i }).click();
}

// Sign in through the API and enrol TOTP, so the session is AAL2 (the super admin's requirement).
async function loginWithTotp(page, email) {
  await page.goto('/auth/login');
  expect((await api(page).post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const enroll = await (await api(page).post('/api/auth/mfa/enroll', { friendlyName: 'E2E phone' })).json();
  const { challengeId } = await (await api(page).post('/api/auth/mfa/challenge', { factorId: enroll.factorId })).json();
  const verified = await api(page).post('/api/auth/mfa/verify', { factorId: enroll.factorId, challengeId, code: totp(enroll.secret) });
  expect((await verified.json()).enrolled).toBe(true);
}

function sidebar(page) {
  return page.getByRole('navigation', { name: 'Workspace' });
}

async function expectWorkspaceItems(page) {
  for (const name of WORKSPACE_ITEMS) await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeVisible();
}

test('an admin sees no Admin Panel and is sent away from /admin/panel', async ({ page }) => {
  const email = uniqueEmail('admin');
  await accounts.createUser(page.request, email);
  await loginUi(page, email);
  await expect(page).toHaveURL(/\/admin$/);

  await expectWorkspaceItems(page);
  await expect(sidebar(page).getByRole('link', { name: 'Admin Panel' })).toHaveCount(0);

  for (const path of ['/admin/panel', '/admin/panel/users', '/super-admin/users']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin$/);
  }
});

test('the super admin gets the same sidebar plus Admin Panel, which lists admins', async ({ page }) => {
  test.setTimeout(120_000);
  const adminEmail = uniqueEmail('listed-admin');
  await accounts.createUser(page.request, adminEmail);
  const email = uniqueEmail('super');
  promoteToSuperAdmin(await accounts.createUser(page.request, email));
  await loginWithTotp(page, email);

  await page.goto('/admin');
  await expectWorkspaceItems(page);
  await expect(page.getByRole('navigation', { name: 'Platform' })).toHaveCount(0);
  await sidebar(page).getByRole('link', { name: 'Admin Panel' }).click();

  await expect(page).toHaveURL(/\/admin\/panel\/users$/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('Admin Panel');
  await expect(crumbs).toContainText('Users');
  await expect(page.getByRole('heading', { name: 'Admins' })).toBeVisible();
  await page.getByPlaceholder('Search by email').fill(adminEmail);
  await expect(page.getByRole('row', { name: new RegExp(adminEmail) })).toContainText('Active');

  const sections = page.getByRole('navigation', { name: 'Admin Panel sections' });
  await sections.getByRole('link', { name: 'Platform audit' }).click();
  await expect(page).toHaveURL(/\/admin\/panel\/audit$/);

  // Old URLs land in the Admin Panel; the old profile goes to the shared account page.
  await page.goto('/super-admin/features');
  await expect(page).toHaveURL(/\/admin\/panel\/features$/);
  await page.goto('/super-admin/profile');
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.getByRole('menuitem', { name: 'Platform admin' })).toHaveCount(0);
});
