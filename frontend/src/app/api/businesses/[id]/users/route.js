import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import { backendErrorResponse, requireCaller } from '@/lib/server/managed-users';
import { createBusinessUserSchema } from '@/lib/schemas/member-access';
import { zodToApiError } from '@/lib/utils/api-errors';
import { USER_MANAGEMENT_COPY } from '@/lib/copy/user-management';

const EMAIL_EXISTS_CODE = 'email_exists';

/**
 * POST /api/businesses/[id]/users
 * The business owner creates a business user (D-30): name, email, password.
 * 1. FastAPI: caller is the LIVE owner, the email is usable (generic refusal), rate limit.
 * 2. Supabase admin API: confirmed account, platform role `member` via app_metadata
 *    (provisioned_for_business + created_by_user_id, settable only with the service key).
 * 3. FastAPI: membership + access; on failure the new account is deleted again.
 */
export async function POST(request, { params }) {
  try {
    const { id: businessId } = await params;
    const caller = await requireCaller(request);
    if (caller instanceof NextResponse) return caller;

    const input = createBusinessUserSchema.parse(await request.json());
    const businessPath = `/api/v1/businesses/${encodeURIComponent(businessId)}`;

    const check = await fetchBackendAsCaller(request, `${businessPath}/users/email-check`, {
      method: 'POST',
      body: { email: input.email },
    });
    if (!check.ok) return backendErrorResponse(check);

    const adminClient = await createServerAdminClient();
    const { data, error } = await adminClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name },
      app_metadata: {
        provisioned_for_business: businessId,
        created_by_user_id: caller.user.id,
        must_change_password: input.must_change_password,
      },
    });
    if (error || !data?.user) {
      const refused = error?.code === EMAIL_EXISTS_CODE;
      return NextResponse.json(
        { error: refused ? USER_MANAGEMENT_COPY.emailRefused : USER_MANAGEMENT_COPY.createFailed },
        { status: refused ? 422 : 400 },
      );
    }

    const added = await fetchBackendAsCaller(request, `${businessPath}/members`, {
      method: 'POST',
      body: { user_id: data.user.id, ...input.access },
    });
    if (!added.ok) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return backendErrorResponse(added);
    }

    await fetchBackendAsCaller(request, `/api/v1/managed-users/${data.user.id}/actions`, {
      method: 'POST',
      body: { action: 'create' },
    });
    return NextResponse.json({ user_id: data.user.id, member: await added.json() }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(zodToApiError(error), { status: 400 });
    }
    console.error('Create business user error:', error);
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.createFailed }, { status: 500 });
  }
}
