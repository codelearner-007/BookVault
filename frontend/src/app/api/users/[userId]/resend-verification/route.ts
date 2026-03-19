import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminAction } from '@/lib/utils/admin-auth';

/**
 * POST /api/users/[userId]/resend-verification
 * Resend verification email to user (requires users:update_all permission)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const auth = await authorizeAdminAction(request, userId, 'users:update_all');
    if (auth instanceof NextResponse) return auth;

    // Get target user email for the verification link
    const { data: targetUserData } =
      await auth.adminClient.auth.admin.getUserById(auth.userId);

    if (!targetUserData?.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 404 });
    }

    const { error } = await auth.adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUserData.user.email,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    );
  }
}
