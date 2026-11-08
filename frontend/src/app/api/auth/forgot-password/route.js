import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit, siteUrl } from '@/lib/server/auth-guard';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

/** Always 200 with one message, whether or not the email has an account (AC-37). */
export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const { email } = forgotPasswordSchema.parse(await request.json());
    const limited = enforceAuthRateLimit(request, 'forgot', email);
    if (limited) return limited;

    const supabase = await createSSRClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl(request)}/api/auth/callback?next=/auth/reset-password`,
    });
    if (error) console.error('Password reset email refused by Supabase Auth:', error.code);

    return NextResponse.json({ message: AUTH_COPY.resetSent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
