// Journal entries end to end (B1): create and post a two-line entry, see it in the Trial Balance,
// void it and see the reversal in its Transaction Journal. Needs the local stack, FastAPI on :8000
// and Next.js on :3000 (PLAYWRIGHT_BASE_URL=http://localhost:3000).
import { test, expect } from '@playwright/test';
import { PASSWORD, api, trackAccounts, uniqueSuffix } from './support/accounts';
import { openTransactionJournal } from './support/documents';

const AMOUNT = '125.50';

const accounts = trackAccounts();
test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));

async function chooseAccount(page, line, accountName) {
  await page.getByRole('combobox', { name: `Account, line ${line}` }).click();
  await page.getByRole('option', { name: accountName, exact: true }).click();
}

test('post a journal entry, see it in the trial balance, void it and see the reversal', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const email = `je-owner-${suffix}@e2e.bookvault.dev`;
  const expenseAccount = `E2E Rent ${suffix}`;
  const equityAccount = `E2E Owner Funds ${suffix}`;
  const description = `E2E rent ${suffix}`;
  await accounts.createUser(page.request, email);

  // Setup through the API: sign in, a business with Journal Entries and Reports on, two accounts.
  await page.goto('/auth/login');
  const calls = api(page.request, baseURL);
  expect((await calls.post('/api/auth/login', { email, password: PASSWORD })).ok()).toBeTruthy();
  const created = await calls.post('/api/v1/businesses', { name: 'Journal E2E' });
  expect(created.ok(), await created.text()).toBeTruthy();
  const business = await created.json();
  accounts.addBusiness(email, business);
  // A write right after the create can land before the create is visible (404); retry briefly.
  await expect.poll(async () => (await calls.put(`/api/v1/businesses/${business.id}/tabs`, {
    items: [{ key: 'journal-entries', enabled: true }, { key: 'reports', enabled: true }],
  })).status()).toBe(200);
  for (const [name, type] of [[expenseAccount, 'expense'], [equityAccount, 'equity']]) {
    const account = await calls.post(`/api/v1/businesses/${business.id}/chart-of-accounts/accounts`, { name, type });
    expect(account.ok(), await account.text()).toBeTruthy();
  }

  // New journal entry: debit rent, credit owner funds; totals come back from the server.
  await page.goto(`/admin/businesses/${business.id}?tab=journal-entries`);
  await page.getByRole('button', { name: 'New Journal Entry' }).click();
  await expect(page.getByRole('heading', { name: 'New Journal Entry' })).toBeVisible();
  await page.getByLabel('Description', { exact: true }).fill(description);
  await chooseAccount(page, 1, expenseAccount);
  await page.getByLabel('Debit, line 1').fill(AMOUNT);
  await chooseAccount(page, 2, equityAccount);
  await page.getByLabel('Credit, line 2').fill(AMOUNT);
  await expect(page.getByText(AMOUNT, { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  // The view: posted, with the original entry in the Transaction Journal.
  await expect(page).toHaveURL(/tab=journal-entries&view=/);
  const entryUrl = page.url();
  await expect(page.getByRole('heading', { name: /^Journal Entry/ })).toBeVisible();
  await expect(page.getByText('Posted', { exact: true })).toBeVisible();
  const journal = await openTransactionJournal(page);
  await expect(journal.getByText('Original', { exact: true })).toBeVisible();
  await expect(journal.getByRole('row', { name: new RegExp(expenseAccount) })).toContainText(AMOUNT);

  // Reports -> Trial Balance shows both sides of the entry.
  await page.goto(`/admin/businesses/${business.id}?tab=reports`);
  await page.getByRole('link', { name: 'Trial Balance' }).click();
  await expect(page.getByRole('heading', { name: 'Trial Balance' })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(expenseAccount) })).toContainText(AMOUNT);
  await expect(page.getByRole('row', { name: new RegExp(equityAccount) })).toContainText(AMOUNT);

  // Back to the entry and void it: the reversal joins the Transaction Journal.
  await page.goto(entryUrl);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Void' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Void' }).click();
  await expect(page.getByText('Void', { exact: true })).toBeVisible();
  await openTransactionJournal(page);
  await expect(journal.getByText('Original', { exact: true })).toBeVisible();
  await expect(journal.getByText('Reversal', { exact: true })).toBeVisible();
  await expect(journal.getByRole('row', { name: new RegExp(expenseAccount) })).toHaveCount(2);
});
