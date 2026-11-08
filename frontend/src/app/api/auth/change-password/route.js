import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { enforceMFAForOperation } from '@/lib/utils/mfa-check';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { changePasswordSchema } from '@/lib/schemas/auth.schema';
import { zodToApiError } from '@/lib/utils/api-errors';
import { enforceAuthRateLimit } from '@/lib/server/auth-guard';
import { breachedPasswordError, passwordUpdateError, verifyPassword } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';
import { z } from 'zod';

/** Change password with re-authentication (current password, plus AAL2 when 2FA is on). */
export async function POST(request) {
  try {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;

    const supabase = await createSSRClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: AUTH_COPY.unauthorized }, { status: 401 });

    const limited = enforceAuthRateLimit(request, 'change_password', user.id);
    if (limited) return limited;

    const mfaError = await enforceMFAForOperation(supabase);
    if (mfaError) return mfaError;

    const { currentPassword, newPassword } = changePasswordSchema.parse(await request.json());
    if (!(await verifyPassword(user.email, currentPassword))) {
      return NextResponse.json({ error: AUTH_COPY.currentPasswordWrong }, { status: 401 });
    }

    const breached = await breachedPasswordError(newPassword);
    if (breached) return NextResponse.json({ error: breached }, { status: 400 });

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return NextResponse.json({ error: passwordUpdateError(error) }, { status: 400 });

    // A forced change (D-30) is done: clear the flag and refresh the session token.
    if (user.app_metadata?.must_change_password) {
      const adminClient = await createServerAdminClient();
      await adminClient.auth.admin.updateUserById(user.id, { app_metadata: { must_change_password: false } });
      await supabase.auth.refreshSession();
    }

    await supabase.auth.signOut({ scope: 'others' });
    return NextResponse.json({ success: true, message: AUTH_COPY.passwordChanged });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    console.error('Error changing password:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
