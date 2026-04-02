import { NextResponse } from 'next/server';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

/**
 * POST /api/users/[userId]/reset-password
 * Send password reset email to user (requires users:update_all permission)
 */
export async function POST(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId, 'users:update_all');
    if (auth instanceof NextResponse) return auth;

    // Get target user email for the reset link
    const { data: targetUserData } =
      await auth.adminClient.auth.admin.getUserById(auth.userId);

    if (!targetUserData?.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 404 });
    }

    const { error } = await auth.adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: targetUserData.user.email,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Revoke all sessions for security - user must re-authenticate after password reset
    await revokeAllUserSessions(auth.userId);

    return NextResponse.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}
