import { NextResponse } from 'next/server';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

/**
 * DELETE /api/users/[userId]/delete
 * Permanently delete a user account (requires users:delete_all permission)
 */
export async function DELETE(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId, 'users:delete_all');
    if (auth instanceof NextResponse) return auth;

    // Revoke all sessions before deletion so user is immediately logged out
    await revokeAllUserSessions(auth.userId);

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
