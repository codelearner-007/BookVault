import { createClient } from '@supabase/supabase-js';
import { fetchBackendWithToken } from '@/lib/server/backend';
import { AUTH_CONFIG } from '@/lib/server/auth-config';
import { isBreachedPassword } from '@/lib/server/breached-password';
import { AUTH_COPY } from '@/lib/copy/auth';

/**
 * Re-authentication: check a password with a throw-away anon client (no cookies), then
 * sign that extra session out again. The caller's own session is not touched.
 */
export async function verifyPassword(email, password) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await client.auth.signOut({ scope: 'local' });
  return true;
}

/** Message for a new password GoTrue would accept but the breach pre-check refuses (D-24). */
export async function breachedPasswordError(password) {
  const breached = await isBreachedPassword(password, {
    mode: AUTH_CONFIG.breachCheck,
    timeoutMs: AUTH_CONFIG.breachCheckTimeoutMs,
  });
  return breached ? AUTH_COPY.breachedPassword : null;
}

/** GoTrue's refusal of a new password, mapped to text that reveals nothing else. */
export function passwordUpdateError(error) {
  if (error?.code === 'weak_password') return AUTH_COPY.weakPassword;
  if (error?.code === 'reauthentication_needed') return AUTH_COPY.reauthRequired;
  if (error?.code === 'same_password') return 'New password must be different from the current one';
  return AUTH_COPY.failed;
}

/**
 * Audit an event only Next.js sees (mfa_enrolled, sessions_revoked) through FastAPI.
 * Best effort: the user action already happened, a failed audit write is logged.
 */
export async function recordAuthEvent(accessToken, event) {
  try {
    const response = await fetchBackendWithToken(accessToken, '/api/v1/auth/events', {
      method: 'POST',
      body: { event },
    });
    if (!response.ok) console.error(`Auth audit event ${event} refused: ${response.status}`);
  } catch (error) {
    console.error(`Auth audit event ${event} failed:`, error?.message);
  }
}

export function isRateLimited(error) {
  return error?.status === 429 || error?.code === 'over_request_rate_limit' || error?.code === 'over_email_send_rate_limit';
}
