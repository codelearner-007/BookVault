import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revokeAllUserSessions } from '@/lib/supabase/serverAdminClient';
import { authorizeManagedUserAction } from '@/lib/server/managed-users';
import { updateBusinessUserSchema } from '@/lib/schemas/member-access';
import { zodToApiError } from '@/lib/utils/api-errors';
import { USER_MANAGEMENT_COPY } from '@/lib/copy/user-management';

/**
 * PATCH /api/users/[userId]: the creator edits name/email of a business user they created.
 * A new email gets the same generic refusal as at creation (checked by FastAPI, which
 * also stores the new name in user_profiles).
 */
export async function PATCH(request, { params }) {
  try {
    const { userId } = await params;
    const input = updateBusinessUserSchema.parse(await request.json());
    const auth = await authorizeManagedUserAction(request, userId, 'edit', input);
    if (auth instanceof NextResponse) return auth;

    const { error } = await auth.adminClient.auth.admin.updateUserById(userId, {
      ...(input.email ? { email: input.email, email_confirm: true } : {}),
      ...(input.full_name ? { user_metadata: { full_name: input.full_name } } : {}),
    });
    if (error) {
      return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 400 });
    }
    return NextResponse.json({ user_id: userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    console.error('Edit business user error:', error);
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[userId]: the creator deletes a business user they created.
 * Its memberships (all in the creator's businesses by construction) go with it.
 */
export async function DELETE(request, { params }) {
  try {
    const { userId } = await params;
    const auth = await authorizeManagedUserAction(request, userId, 'delete');
    if (auth instanceof NextResponse) return auth;

    await revokeAllUserSessions(userId);
    const { error } = await auth.adminClient.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 400 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete business user error:', error);
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.actionFailed }, { status: 500 });
  }
}
