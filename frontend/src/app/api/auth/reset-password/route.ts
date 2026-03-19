import { NextRequest, NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { resetPasswordSchema } from '@/lib/schemas/auth.schema';
import { enforceMFAForOperation } from '@/lib/utils/mfa-check';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { zodToApiError } from '@/lib/utils/api-errors';
import { z } from 'zod';

// TODO: Add rate limiting for production
// Consider Vercel Edge Config, Upstash Redis, or middleware-based solutions
// Recommended: 5 attempts per 15 minutes per IP address
export async function POST(request: NextRequest) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const body = await request.json();
    const validated = resetPasswordSchema.parse(body);

    const supabase = await createSSRClient();

    // Get current user to check MFA status
    // Note: reset-password can be called in two contexts:
    // 1. Authenticated user with reset token (session exists) → enforce MFA
    // 2. Unauthenticated user with email reset token (no session) → skip MFA check
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // User is authenticated - enforce MFA if they have it enabled
      const mfaError = await enforceMFAForOperation(supabase);
      if (mfaError) return mfaError;
    }

    const { error } = await supabase.auth.updateUser({
      password: validated.password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
