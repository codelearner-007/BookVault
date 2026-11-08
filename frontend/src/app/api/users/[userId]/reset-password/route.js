import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeManagedUserAction } from '@/lib/server/managed-users';
import { resetBusinessUserPasswordSchema } from '@/lib/schemas/member-access';
import { zodToApiError } from '@/lib/utils/api-errors';
import { USER_MANAGEMENT_COPY } from '@/lib/copy/user-management';

/**
 * POST /api/users/[userId]/reset-password
 * The creator sets a new password for a business user they created (D-30; D-34: no
 * longer a super-admin platform action). "Change at next login" defaults to on.
 */
export async function POST(request, { params }) {
  try {
    const { userId } = await params;
    const input = resetBusinessUserPasswordSchema.parse(await request.json());
    const auth = await authorizeManagedUserAction(request, userId, 'reset_password');
    if (auth instanceof NextResponse) return auth;

    const { error } = await auth.adminClient.auth.admin.updateUserById(userId, {
      password: input.password,
      app_metadata: { must_change_password: input.must_change_password },
    });
    if (error) {
      return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 400 });
    }
    await revokeAllUserSessions(userId);
    return NextResponse.json({ user_id: userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    console.error('Reset business user password error:', error);
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 500 });
  }
}
