// Summary header actions (Backup, History) for one business. Needs the local stack, FastAPI on :8000 and
// Next.js (PLAYWRIGHT_BASE_URL). The owner has two businesses; both actions must stay on the open one.
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueEmail } from './support/accounts';

const accounts = trackAccounts();
test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));

async function createBusiness(calls, accountsRef, email, name) {
  const created = await calls.post('/api/v1/businesses', { name });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();
  accountsRef.addBusiness(email, business);
  return business;
}

test('Backup downloads this business only; History lists only its changes', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('summary');
  await accounts.createUser(page.request, email);
  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const business = await createBusiness(calls, accounts, email, 'Summary Backup E2E');
  const other = await createBusiness(calls, accounts, email, 'Summary Other E2E');

  await page.goto(`/admin/businesses/${business.id}?tab=summary`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Summary-Backup-E2E-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.business_id).toBe(business.id);
  expect(backup.tables.businesses.map((row) => row.id)).toEqual([business.id]);
  expect(JSON.stringify(backup)).not.toContain(other.id);

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/businesses/${business.id}\\?page=history`));
  const history = await calls.get(`/api/v1/businesses/${business.id}/history`);
  const rows = (await history.json()).items;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.business_id === business.id)).toBeTruthy();
});
