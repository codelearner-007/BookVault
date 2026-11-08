import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { USER_MANAGEMENT_COPY } from '@/lib/copy/user-management';

const EMAIL_UNUSABLE_CODE = 'email_unusable';
// A disabled account: a ban long enough to be permanent in practice.
export const DISABLE_BAN_DURATION = '876000h';
export const ENABLE_BAN_DURATION = 'none';

/**
 * Map a FastAPI refusal to a response that reveals nothing beyond the status:
 * refused emails share one generic text (D-31 replaced); foreign users are 404.
 */
export async function backendErrorResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (response.status === 422 && body?.details?.code === EMAIL_UNUSABLE_CODE) {
    return NextResponse.json({ error: USER_MANAGEMENT_COPY.emailRefused }, { status: 422 });
  }
  const mapped = {
    401: [USER_MANAGEMENT_COPY.forbidden, 401],
    403: [USER_MANAGEMENT_COPY.forbidden, 403],
    404: [USER_MANAGEMENT_COPY.notFound, 404],
    429: [USER_MANAGEMENT_COPY.tooManyRequests, 429],
  }[response.status] ?? [USER_MANAGEMENT_COPY.actionFailed, 400];
  return NextResponse.json({ error: mapped[0] }, { status: mapped[1] });
}

/** CSRF origin check + a signed-in caller. Returns a NextResponse on failure, else { user }. */
export async function requireCaller(request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const supabase = await createSSRClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return { user };
}

/**
 * Account action on a business user (D-30): FastAPI checks LIVE that the caller created
 * the target and that it is still a `member` (anything else 404), rate-limits per
 * creator and audits the action. Returns a NextResponse on failure, else { adminClient, target }.
 */
export async function authorizeManagedUserAction(request, userId, action, changes = {}) {
  const caller = await requireCaller(request);
  if (caller instanceof NextResponse) return caller;

  const response = await fetchBackendAsCaller(
    request,
    `/api/v1/managed-users/${encodeURIComponent(userId)}/actions`,
    { method: 'POST', body: { action, ...changes } },
  );
  if (!response.ok) return backendErrorResponse(response);

  return { adminClient: await createServerAdminClient(), target: await response.json() };
}
