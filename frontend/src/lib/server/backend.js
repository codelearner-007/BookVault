const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

/**
 * Server-side call from a Next.js route handler to FastAPI, as the calling user:
 * the request's cookies (Supabase session) are forwarded, so FastAPI applies its
 * own authentication and authorization. Never call this with a service key.
 */
export async function fetchBackendAsCaller(request, path, { method = 'GET', body } = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_BACKEND_URL;
  const headers = { cookie: request.headers.get('cookie') ?? '' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}
