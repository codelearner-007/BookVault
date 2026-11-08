// One interface for admins and the super admin (2026-11-08): the same sidebar, plus one
// "Admin Panel" tab for the super admin only. Needs FastAPI and Next.js (PLAYWRIGHT_BASE_URL).
//
// The super-admin test promotes its own throwaway user, so it never runs against the development database:
// it needs an isolated, disposable stack (E2E_ISOLATED_STACK=1 and TEST_DB_CONTAINER naming that stack's
// database container). Teardown demotes every user it promoted, then deletes all users the spec created.
import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PASSWORD, trackAccounts, uniqueEmail } from './support/accounts';

const DB_CONTAINER = process.env.TEST_DB_CONTAINER;
const ISOLATED_STACK = process.env.E2E_ISOLATED_STACK === '1' && Boolean(DB_CONTAINER);
const TOTP_STEP_SECONDS = 30;
const WORKSPACE_ITEMS = ['Dashboard', 'Businesses', 'Audit logs', 'Account'];

const accounts = trackAccounts();
const promoted = [];
test.afterEach(async ({ request, baseURL }) => {
  // No super admin outlives the test, even if deleting the user fails.
  while (promoted.length > 0) setRole(promoted.pop(), 'user');
  await accounts.cleanup(request, baseURL);
});

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

// Test setup only (isolated stack): the platform has no UI that creates a super admin.
function setRole(userId, role) {
  const sql = `UPDATE user_roles SET role_id = (SELECT id FROM roles WHERE name = '${role}') WHERE user_id = '${userId}'`;
  execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

function promoteToSuperAdmin(userId) {
  promoted.push(userId);
  setRole(userId, 'super_admin');
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
  test.skip(!ISOLATED_STACK, 'Creates a super admin: runs only on an isolated stack (E2E_ISOLATED_STACK=1, TEST_DB_CONTAINER).');
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
