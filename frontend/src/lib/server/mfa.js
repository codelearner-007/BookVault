import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { enforceAuthRateLimit } from '@/lib/server/auth-guard';
import { verifyPassword } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';

const PASSWORD_METHOD = 'password';
const REAUTH_MAX_AGE_SECONDS = Number.parseInt(process.env.REAUTH_MAX_AGE_SECONDS ?? '', 10) || 300;

/**
 * Common start of every MFA route: CSRF check, signed-in user, per-IP/per-account limit.
 * Returns a NextResponse on failure, else { supabase, user }.
 */
export async function startMfaRoute(request, action) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: AUTH_COPY.unauthorized }, { status: 401 });
  const limited = enforceAuthRateLimit(request, action, user.id);
  if (limited) return limited;
  return { supabase, user };
}

/**
 * Recent re-authentication: the password sign-in of this session is at most
 * REAUTH_MAX_AGE_SECONDS old (JWT amr), or the request carries the current password.
 */
export async function hasRecentReauth(supabase, user, password) {
  const { data } = await supabase.auth.getClaims();
  const amr = data?.claims?.amr ?? [];
  const signedInAt = amr.find((entry) => entry.method === PASSWORD_METHOD)?.timestamp ?? 0;
  if (Date.now() / 1000 - signedInAt <= REAUTH_MAX_AGE_SECONDS) return true;
  return typeof password === 'string' && password.length > 0 && verifyPassword(user.email, password);
}

export function reauthRequiredResponse() {
  return NextResponse.json({ error: AUTH_COPY.reauthRequired, code: 'reauth_required' }, { status: 403 });
}
