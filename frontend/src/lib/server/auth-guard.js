import { NextResponse } from 'next/server';
import { AUTH_CONFIG } from '@/lib/server/auth-config';
import { createFixedWindow } from '@/lib/utils/fixed-window';

const counter = createFixedWindow();
export const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a few minutes and try again.';

/** First X-Forwarded-For hop (set by Next.js / the hosting proxy), else the real IP header. */
export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Per-IP and per-account limit for one auth action (CS-16, AC-30). Returns a 429
 * NextResponse when either is exceeded, else null. `account` is an email or user id.
 */
export function enforceAuthRateLimit(request, action, account) {
  const limits = AUTH_CONFIG.rateLimits[action];
  const windowSeconds = AUTH_CONFIG.rateLimitWindowSeconds;
  const checks = [counter.hit(`${action}:ip:${clientIp(request)}`, limits.ip, windowSeconds)];
  if (account) {
    checks.push(counter.hit(`${action}:account:${String(account).toLowerCase()}`, limits.account, windowSeconds));
  }
  const blocked = checks.find((check) => !check.allowed);
  if (!blocked) return null;
  return NextResponse.json(
    { error: TOO_MANY_ATTEMPTS },
    { status: 429, headers: { 'Retry-After': String(blocked.retryAfterSeconds) } },
  );
}

/** Base URL for links in auth emails: the configured site, else this request's own origin. */
export function siteUrl(request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}
