import { NextResponse } from 'next/server';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { DISABLE_BAN_DURATION, authorizeManagedUserAction } from '@/lib/server/managed-users';
import { USER_MANAGEMENT_COPY } from '@/lib/copy/user-management';

/** POST /api/users/[userId]/disable: the creator disables a business user they created. */
export async function POST(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeManagedUserAction(request, userId, 'disable');
    if (auth instanceof NextResponse) return auth;

    const { error } = await auth.adminClient.auth.admin.updateUserById(userId, {
      ban_duration: DISABLE_BAN_DURATION,
    });
    if (error) {
      return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 400 });
    }
    await revokeAllUserSessions(userId);
    return NextResponse.json({ user_id: userId });
  } catch (error) {
    console.error('Disable business user error:', error);
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 500 });
  }
}
