import { CLIENT_HEADER } from '@/lib/config';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Server-side call from a Next.js route handler to FastAPI, as the calling user:
 * the request's cookies (Supabase session) are forwarded, so FastAPI applies its
 * own authentication and authorization. Never call this with a service key.
 */
export async function fetchBackendAsCaller(request, path, options = {}) {
  return callBackend({ cookie: request.headers.get('cookie') ?? '' }, path, options);
}

/**
 * Same, with an access token the route just obtained (sign-in, 2FA verify): the
 * request's cookies still hold the previous session at that point. The token goes
 * server-to-server only, never into a response body.
 */
export async function fetchBackendWithToken(accessToken, path, options = {}) {
  return callBackend({ authorization: `Bearer ${accessToken}` }, path, options);
}

async function callBackend(authHeaders, path, { method = 'GET', body } = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_BACKEND_URL;
  const headers = { ...authHeaders, ...CLIENT_HEADER };
  // Create routes (e.g. POST /members) require an Idempotency-Key; other POSTs tolerate it.
  if (method === 'POST') headers['Idempotency-Key'] = crypto.randomUUID();
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}
