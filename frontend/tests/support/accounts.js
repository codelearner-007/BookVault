// Test accounts shared by the e2e specs: confirmed users made through the Supabase admin API, same-origin API
// calls, and a teardown that removes what a test created (its businesses via Trash + permanent delete, then the
// auth users), so runs do not pile up rows in the dev database.
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const PASSWORD = 'correct horse battery staple';
const ADMIN_USERS_PAGE_SIZE = 1000;

export function envLocal(name) {
  const line = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function uniqueEmail(prefix) {
  return `${prefix}-${uniqueSuffix()}@e2e.bookvault.dev`;
}

function adminUsersUrl(path = '') {
  return `${envLocal('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/admin/users${path}`;
}

function adminHeaders() {
  const key = envLocal('PRIVATE_SUPABASE_SERVICE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// A confirmed auth user (no email round trip); returns its id. Prefer trackAccounts().createUser in specs.
export async function createConfirmedUser(request, email, password = PASSWORD) {
  const response = await request.post(adminUsersUrl(), {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).id;
}

function sameOriginHeaders(baseURL) {
  return { Origin: new URL(baseURL).origin, 'X-BookVault-Client': 'web' };
}

// Same-origin calls with the CSRF headers the routes require; writes carry an Idempotency-Key.
export function api(request, baseURL) {
  const headers = sameOriginHeaders(baseURL);
  const send = (method) => (path, data) => request.fetch(path, {
    method, data: data ?? {}, headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
  });
  return { post: send('POST'), put: send('PUT'), get: (path) => request.get(path, { headers }) };
}

async function findUserId(request, email) {
  for (let page = 1; ; page += 1) {
    const response = await request.get(adminUsersUrl(`?page=${page}&per_page=${ADMIN_USERS_PAGE_SIZE}`), { headers: adminHeaders() });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { users } = await response.json();
    const match = users.find((user) => user.email === email.toLowerCase());
    if (match || users.length < ADMIN_USERS_PAGE_SIZE) return match?.id ?? null;
  }
}

async function deleteAuthUser(request, user) {
  const id = user.id ?? await findUserId(request, user.email);
  if (!id) return;
  const response = await request.delete(adminUsersUrl(`/${id}`), { headers: adminHeaders() });
  expect([200, 404], `delete user ${user.email}: ${await response.text()}`).toContain(response.status());
}

// The owner signs in again (permanent delete needs a recent password sign-in), then each business goes to
// Trash and is deleted for good (typed name + export offered, as the UI requires).
async function purgeBusinesses(request, baseURL, user) {
  if (user.businesses.length === 0) return;
  const headers = sameOriginHeaders(baseURL);
  const login = await request.post(`${baseURL}/api/auth/login`, { data: { email: user.email, password: user.password }, headers });
  expect(login.ok(), `sign in ${user.email} for cleanup: ${await login.text()}`).toBeTruthy();
  for (const business of user.businesses) {
    const url = `${baseURL}/api/v1/businesses/${business.id}`;
    const trashed = await request.delete(url, { headers });
    expect([204, 404], `trash ${business.name}: ${await trashed.text()}`).toContain(trashed.status());
    const purged = await request.fetch(`${url}/permanent`, {
      method: 'DELETE', headers, data: { confirmation: business.name, export_offered: true },
    });
    expect(purged.status(), `purge ${business.name}: ${await purged.text()}`).toBe(204);
  }
}

/*
  What a spec creates, removed by cleanup() in test.afterEach:
    const accounts = trackAccounts();
    test.afterEach(({ request, baseURL }) => accounts.cleanup(request, baseURL));
  Businesses are purged before users (an owner cannot be deleted while it owns one).
*/
export function trackAccounts() {
  let users = [];
  const owner = (email) => users.find((user) => user.email === email);
  return {
    async createUser(request, email, password = PASSWORD) {
      const id = await createConfirmedUser(request, email, password);
      users.push({ email, password, id, businesses: [] });
      return id;
    },
    // A user made another way (the sign-up form, Members > Add user): found by email at cleanup.
    addUser(email, password = PASSWORD) {
      users.push({ email, password, id: null, businesses: [] });
    },
    addBusiness(ownerEmail, business) {
      owner(ownerEmail).businesses.push({ id: business.id, name: business.name });
    },
    async cleanup(request, baseURL) {
      const pending = users;
      users = [];
      const failures = [];
      const attempt = async (step) => {
        try { await step(); } catch (error) { failures.push(error); }
      };
      for (const user of pending) await attempt(() => purgeBusinesses(request, baseURL, user));
      for (const user of pending) await attempt(() => deleteAuthUser(request, user));
      if (failures.length > 0) throw new AggregateError(failures, failures.map((error) => error.message).join('\n'));
    },
  };
}
