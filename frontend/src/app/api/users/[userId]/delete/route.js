import { NextResponse } from 'next/server';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

// A user who owns businesses is deactivated, never deleted (businesses.owner_id is
// ON DELETE RESTRICT, CS-10): a ban long enough to be permanent in practice.
const DEACTIVATION_BAN_DURATION = '876000h';

/**
 * DELETE /api/users/[userId]/delete
 * Delete a user account (live super admin only). Owners of businesses are deactivated.
 */
export async function DELETE(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId);
    if (auth instanceof NextResponse) return auth;

    // Revoke all sessions first so the user is immediately logged out
    await revokeAllUserSessions(auth.userId);

    if (auth.ownedBusinessCount > 0) {
      const { error } = await auth.adminClient.auth.admin.updateUserById(auth.userId, {
        ban_duration: DEACTIVATION_BAN_DURATION,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({
        deactivated: true,
        message: 'User owns businesses, so the account was deactivated instead of deleted',
      });
    }

    const { error } = await auth.adminClient.auth.admin.deleteUser(auth.userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
