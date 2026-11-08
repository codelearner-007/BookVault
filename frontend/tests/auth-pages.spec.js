// Auth pages render (Nightglass auth card): each page shows its heading and its main control,
// with no session. Needs Next.js on :3000 (and FastAPI for the signup country list).
import { test, expect } from '@playwright/test';

test.describe('auth pages render', () => {
  test('login', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('login explains a used or expired link', async ({ page }) => {
    await page.goto('/auth/login?error=invalid_code');
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test('register needs the terms before it submits', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('Country')).toBeVisible();
    await expect(page.getByText(/free/i)).toHaveCount(0);
    await page.getByLabel('Email').fill('someone@e2e.bookvault.dev');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await expect(page.getByText(/At least \d+ characters/)).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });

  test('forgot password', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
  });

  test('reset password without a recovery session shows the invalid-link state', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { name: /can’t be used/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/auth/forgot-password');
  });

  test('verify email: pending and expired', async ({ page }) => {
    await page.goto('/auth/verify-email');
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();
    await page.goto('/auth/verify-email?status=expired');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });

  test('2FA without a session goes to login', async ({ page }) => {
    await page.goto('/auth/2fa');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('suspended account', async ({ page }) => {
    await page.goto('/auth/banned');
    await expect(page.getByRole('heading', { name: 'This account is suspended' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  });
});
