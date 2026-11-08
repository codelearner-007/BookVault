import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { resetPasswordSchema } from '@/lib/schemas/auth.schema';
import { enforceMFAForOperation } from '@/lib/utils/mfa-check';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit } from '@/lib/server/auth-guard';
import { breachedPasswordError, passwordUpdateError } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

/**
 * Set a new password from the recovery session the emailed link opened (the link is
 * single-use and expires, GoTrue otp_expiry). Every other session is signed out (AC-38).
 */
export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const validated = resetPasswordSchema.parse(await request.json());
    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: AUTH_COPY.resetLinkInvalid }, { status: 401 });

    const limited = enforceAuthRateLimit(request, 'reset', user.id);
    if (limited) return limited;

    // A user with 2FA must finish the second step before the password changes.
    const mfaError = await enforceMFAForOperation(supabase);
    if (mfaError) return mfaError;

    const breached = await breachedPasswordError(validated.password);
    if (breached) return NextResponse.json({ error: breached }, { status: 400 });

    const { error } = await supabase.auth.updateUser({ password: validated.password });
    if (error) return NextResponse.json({ error: passwordUpdateError(error) }, { status: 400 });

    await supabase.auth.signOut({ scope: 'others' });
    return NextResponse.json({ message: AUTH_COPY.resetDone });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
