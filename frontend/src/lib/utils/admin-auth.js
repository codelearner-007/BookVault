import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import { enforceSameOrigin } from '@/lib/utils/origin';

const SUPER_ADMIN_ROLE = 'super_admin';

/**
 * Shared authorization for platform user-management routes (ban, delete, ...).
 *
 * Performs, in order:
 * 1. CSRF origin check (`enforceSameOrigin`)
 * 2. Session authentication
 * 3. LIVE platform check through FastAPI: the caller must hold super_admin in
 *    user_roles right now (admins have no platform powers, CS-03); FastAPI also
 *    returns the target's LIVE role and owned-business count
 * 4. Super admin protection from that live role, never from app_metadata (CS-04)
 *
 * Returns a `NextResponse` error if any check fails, or
 * `{ adminClient, userId, ownedBusinessCount }`.
 */
export async function authorizeAdminAction(request, targetUserId) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  const supabase = await createSSRClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summaryResponse = await fetchBackendAsCaller(
    request,
    `/api/v1/users/${encodeURIComponent(targetUserId)}/access-summary`,
  );
  if (summaryResponse.status === 401 || summaryResponse.status === 403) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!summaryResponse.ok) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const summary = await summaryResponse.json();

  const adminClient = await createServerAdminClient();
  const { data: targetUserData, error: targetUserError } =
    await adminClient.auth.admin.getUserById(targetUserId);
  if (targetUserError || !targetUserData.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (summary.user_role === SUPER_ADMIN_ROLE) {
    return NextResponse.json(
      { error: 'Superadmin users cannot be modified' },
      { status: 403 }
    );
  }

  return {
    adminClient,
    userId: targetUserId,
    ownedBusinessCount: summary.owned_business_count,
  };
}
