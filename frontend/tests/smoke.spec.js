import { test, expect } from '@playwright/test';

test('landing page loads (NA-14: current hero text)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ship your saas/i })).toBeVisible();
});

test('auth pages load', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Log in', level: 1 })).toBeVisible();

  await page.goto('/auth/register');
  await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();

  await page.goto('/auth/forgot-password');
  await expect(page.getByRole('heading', { name: 'Reset your password', level: 1 })).toBeVisible();
});

test('legal pages load', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible();

  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /terms of service/i })).toBeVisible();
});

test('optional: login flow (requires env credentials)', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  test.skip(!email || !password, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set');

  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();

  // Either lands in the app or goes to the 2FA step, depending on the account.
  await page.waitForURL(/\/(admin|auth\/2fa)/);
});
