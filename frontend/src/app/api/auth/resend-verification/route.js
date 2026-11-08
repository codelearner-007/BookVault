import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit, siteUrl } from '@/lib/server/auth-guard';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

/** Resend the signup verification email; always the same answer (AC-37). */
export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const { email } = forgotPasswordSchema.parse(await request.json());
    const limited = enforceAuthRateLimit(request, 'resend', email);
    if (limited) return limited;

    const supabase = await createSSRClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${siteUrl(request)}/api/auth/callback?next=/admin` },
    });
    if (error) console.error('Resend verification refused by Supabase Auth:', error.code);

    return NextResponse.json({ message: AUTH_COPY.verificationSent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
