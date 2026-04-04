import { NextResponse } from 'next/server';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

/**
 * POST /api/users/[userId]/ban
 * Ban a user account (requires users:update_all permission)
 */
export async function POST(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId);
    if (auth instanceof NextResponse) return auth;

    const { duration = '8760h' } = await request.json();

    const { data, error } = await auth.adminClient.auth.admin.updateUserById(
      auth.userId,
      { ban_duration: duration }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Revoke all sessions so user is immediately logged out on all devices
    await revokeAllUserSessions(auth.userId);

    return NextResponse.json({ data, message: 'User banned successfully' });
  } catch (error) {
    console.error('Ban user error:', error);
    return NextResponse.json({ error: 'Failed to ban user' }, { status: 500 });
  }
}
