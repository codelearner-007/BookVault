import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/schemas/auth.schema';
import { checkMFAStatus } from '@/lib/utils/mfa-check';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit, TOO_MANY_ATTEMPTS } from '@/lib/server/auth-guard';
import { isRateLimited } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const validated = loginSchema.parse(await request.json());
    const limited = enforceAuthRateLimit(request, 'login', validated.email);
    if (limited) return limited;

    const supabase = await createSSRClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    });

    // One answer for a wrong password, an unknown or unconfirmed email and a banned
    // account (AC-37). Failed checks are audited by the GoTrue password hook.
    if (error) {
      if (isRateLimited(error)) return NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 });
      return NextResponse.json({ error: AUTH_COPY.invalidCredentials }, { status: 401 });
    }

    const { hasVerifiedMFA, requiresMFA, currentLevel } = await checkMFAStatus(supabase);

    // Tokens stay in the httpOnly cookies set by the SSR client; never in the body.
    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      requiresMFA,
      hasVerifiedMFA,
      currentAAL: currentLevel,
      mustChangePassword: Boolean(data.user.app_metadata?.must_change_password),
      mfaReenrollRequired: Boolean(data.user.app_metadata?.mfa_reenroll_required),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
