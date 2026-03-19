import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

/**
 * POST /api/users/[userId]/unban
 * Unban a user account (requires users:update_all permission)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId, 'users:update_all');
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await auth.adminClient.auth.admin.updateUserById(
      auth.userId,
      { ban_duration: 'none' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, message: 'User unbanned successfully' });
  } catch (error) {
    console.error('Unban user error:', error);
    return NextResponse.json({ error: 'Failed to unban user' }, { status: 500 });
  }
}
