import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { registerSchema } from '@/lib/schemas/auth.schema';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit, siteUrl, TOO_MANY_ATTEMPTS } from '@/lib/server/auth-guard';
import { breachedPasswordError, isRateLimited, passwordUpdateError } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const validated = registerSchema.parse(await request.json());
    const limited = enforceAuthRateLimit(request, 'signup', validated.email);
    if (limited) return limited;

    const breached = await breachedPasswordError(validated.password);
    if (breached) return NextResponse.json({ error: breached }, { status: 400 });

    const supabase = await createSSRClient();
    const { error } = await supabase.auth.signUp({
      email: validated.email,
      password: validated.password,
      options: {
        emailRedirectTo: `${siteUrl(request)}/api/auth/callback?next=/admin`,
        // handle_new_user keeps country_id only when it names a real country.
        data: { full_name: validated.full_name || '', country_id: validated.country_id },
      },
    });

    if (error) {
      if (isRateLimited(error)) return NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 });
      if (error.code === 'weak_password') {
        return NextResponse.json({ error: passwordUpdateError(error) }, { status: 400 });
      }
      // Anything else (e.g. a refused address) gets the same answer as a success (AC-37).
      console.error('Signup refused by Supabase Auth:', error.code);
    }

    // With confirmations on, GoTrue answers an existing email like a new one; so do we.
    return NextResponse.json({ message: AUTH_COPY.signupSent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
