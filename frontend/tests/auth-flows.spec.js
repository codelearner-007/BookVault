// Auth flows end to end (B0.7): emails are read from the local mail catcher (Mailpit).
// Needs the local stack, FastAPI on :8000 and Next.js on :3000. Run with
// PLAYWRIGHT_BASE_URL=http://localhost:3000 so the emailed links (NEXT_PUBLIC_SITE_URL)
// land on the same host as the PKCE cookies.
import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:55344/api/v1';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a different long passphrase';
const VERIFY_LINK = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>)]+/;
const TOTP_STEP_SECONDS = 30;

function envLocal(name) {
  const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.bookvault.dev`;
}

// ---------------------------------------------------------------- TOTP (RFC 6238)

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

let lastStep = 0;
// A fresh time step for every use, so a code is never replayed.
async function freshTotp(secret) {
  let step = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  while (step <= lastStep) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    step = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  }
  lastStep = step;
  return totp(secret, step);
}

// ---------------------------------------------------------------- mail catcher

async function latestLink(request, email, { after = 0 } = {}) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = await (await request.get(`${MAILPIT}/search`, { params: { query: `to:"${email}"` } })).json();
    const message = (found.messages || []).find((m) => Date.parse(m.Created) > after);
    if (message) {
      const body = await (await request.get(`${MAILPIT}/message/${message.ID}`)).json();
      const match = VERIFY_LINK.exec(body.Text || '') || VERIFY_LINK.exec(body.HTML || '');
      if (match) return match[0].replace(/&amp;/g, '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`no email with a link for ${email}`);
}

// ---------------------------------------------------------------- helpers

function api(page) {
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin, 'X-BookVault-Client': 'web' };
  return {
    post: (path, data) => page.request.post(path, { data: data ?? {}, headers }),
  };
}

async function loginUi(page, email, password) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

async function createConfirmedUser(request, email, password) {
  const key = envLocal('PRIVATE_SUPABASE_SERVICE_KEY');
  const response = await request.post(`${envLocal('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/admin/users`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    data: { email, password, email_confirm: true },
  });
  expect(response.ok()).toBeTruthy();
}

// ---------------------------------------------------------------- flows

test('signup -> verify -> login -> 2FA enroll -> logout -> TOTP login -> recovery code', async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail('signup');

  // Signup with the country picker (prefilled from the browser locale; chosen explicitly here).
  await page.goto('/auth/register');
  await page.getByLabel('Full name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Country').click();
  await page.getByRole('option', { name: 'Pakistan' }).click();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.locator('#terms').click();
  const sentAt = Date.now() - 1000;
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email/);

  // Verify from the email, then sign out and sign in with the password.
  await page.goto(await latestLink(page.request, email, { after: sentAt }));
  await expect(page).toHaveURL(/\/admin/);
  await api(page).post('/api/auth/logout');
  await loginUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/(admin|app)/);

  // Enroll TOTP (QR code + manual key), verify it, get the recovery codes.
  const enroll = await (await api(page).post('/api/auth/mfa/enroll', { friendlyName: 'E2E phone' })).json();
  expect(enroll.qrCode).toContain('svg');
  expect(enroll.secret).toMatch(/^[A-Z2-7]+=*$/);
  const { challengeId } = await (await api(page).post('/api/auth/mfa/challenge', { factorId: enroll.factorId })).json();
  const verified = await api(page).post('/api/auth/mfa/verify', {
    factorId: enroll.factorId, challengeId, code: await freshTotp(enroll.secret),
  });
  expect((await verified.json()).enrolled).toBe(true);
  const codesResponse = await api(page).post('/api/auth/mfa/recovery-codes');
  expect(codesResponse.status()).toBe(201);
  const { codes } = await codesResponse.json();
  expect(codes).toHaveLength(10);

  // Log out, sign in again: the TOTP challenge is required (fail closed), then passes.
  await api(page).post('/api/auth/logout');
  await loginUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/auth\/2fa/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\/2fa/);
  await page.getByLabel('Authentication code').fill(await freshTotp(enroll.secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).not.toHaveURL(/\/auth\/2fa/);

  // Lost phone: sign in, spend a recovery code on the 2FA page. The factor is removed and
  // the user must enroll again before using the app (enrol-first page).
  await api(page).post('/api/auth/logout');
  await loginUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/auth\/2fa/);
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await page.getByLabel('Recovery code').fill(codes[0]);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await expect(page).toHaveURL(/\/auth\/enroll-2fa/);
  const reused = await api(page).post('/api/auth/mfa/recover', { code: codes[0] });
  expect(reused.status()).toBe(400);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/auth\/enroll-2fa/);
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
});

test('forgot password -> reset from the email; the link cannot be used twice', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('reset');
  await createConfirmedUser(page.request, email, PASSWORD);

  await page.goto('/auth/forgot-password');
  await page.getByLabel('Email').fill(email);
  const sentAt = Date.now() - 1000;
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/if an account exists|check your email/i).first()).toBeVisible();

  const link = await latestLink(page.request, email, { after: sentAt });
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/reset-password/);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Second use of the same link, in a clean browser: refused with an explanation, no session.
  const fresh = await browser.newContext();
  const second = await fresh.newPage();
  await second.goto(link);
  await expect(second).toHaveURL(/\/auth\/reset-password\?status=invalid/);
  await expect(second.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  await second.goto('/admin');
  await expect(second).toHaveURL(/\/auth\/login/);

  // The new password works, the old one does not.
  await loginUi(second, email, PASSWORD);
  await expect(second.getByText('Invalid email or password').first()).toBeVisible();
  await loginUi(second, email, NEW_PASSWORD);
  await expect(second).toHaveURL(/\/(admin|app)/);
  await fresh.close();
});

test('Account -> Security: password, 2FA on with codes, new codes, 2FA off, other sessions', async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail('security');
  await createConfirmedUser(page.request, email, PASSWORD);
  await loginUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/admin/);
  await page.goto('/admin/profile?tab=security');

  // Change password (re-auth with the current one).
  await page.getByRole('button', { name: 'Change password' }).click();
  const passwordDialog = page.getByRole('dialog');
  await passwordDialog.getByLabel('Current password').fill(PASSWORD);
  await passwordDialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await passwordDialog.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await passwordDialog.getByRole('button', { name: 'Save password' }).click();
  await expect(passwordDialog).toBeHidden();

  // Turn on 2FA: QR + manual key, verify a code, recovery codes shown once.
  await page.getByRole('button', { name: 'Turn on' }).click();
  const enrolDialog = page.getByRole('dialog');
  await expect(enrolDialog.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  const secret = (await enrolDialog.locator('code').textContent()).trim();
  await enrolDialog.getByLabel('Authentication code').fill(await freshTotp(secret));
  await enrolDialog.getByRole('button', { name: 'Verify and turn on' }).click();
  await expect(enrolDialog.getByRole('list', { name: 'Save your recovery codes' }).getByRole('listitem')).toHaveCount(10);
  await enrolDialog.getByRole('button', { name: 'I saved my codes' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  await expect(page.getByText(/10 unused/)).toBeVisible();

  // New recovery codes replace the old set.
  await page.getByRole('button', { name: 'Generate new codes' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generate new codes' }).click();
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(10);
  await page.getByRole('dialog').getByRole('button', { name: 'I saved my codes' }).click();

  // Turn off: password + a current code.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Turn off two-factor sign-in' }).click();
  const disableDialog = page.getByRole('dialog');
  await disableDialog.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await disableDialog.getByLabel('Authentication code').fill(await freshTotp(secret));
  await disableDialog.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  // Log out other sessions, confirmed.
  await page.getByRole('button', { name: 'Log out other sessions' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Log out other sessions' }).click();
  await expect(page.getByText('All other sessions were signed out.')).toBeVisible();
});
