import { NextResponse } from 'next/server';

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function getAllowedOriginsFromEnv(): string[] {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL, // sometimes used in deployments
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter(Boolean) as string[];

  return candidates.map(normalizeOrigin).filter(Boolean);
}

/**
 * Cookie-authenticated API routes should reject cross-site POST/PATCH/DELETE requests.
 * This is a pragmatic CSRF defense for browser-based clients.
 *
 * Returns a 403 response when the origin is missing/mismatched in production.
 * In development, it fails open to avoid blocking non-browser tooling.
 */
export function enforceSameOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (!isMutating) return null;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // Non-browser clients often omit Origin; allow in dev, require in production.
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
  }

  const requestOrigin = normalizeOrigin(origin);
  if (!requestOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const allowedOrigins = new Set(getAllowedOriginsFromEnv());
  if (host) {
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);
  }

  if (!allowedOrigins.has(requestOrigin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

