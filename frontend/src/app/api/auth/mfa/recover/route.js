import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import { startMfaRoute } from '@/lib/server/mfa';
import { TOO_MANY_ATTEMPTS } from '@/lib/server/auth-guard';
import { AUTH_COPY } from '@/lib/copy/auth';

/**
 * Sign in with a recovery code instead of TOTP (D-23): FastAPI spends the code (single
 * use, rate-limited, audited), then the TOTP factors are deleted with the admin API and
 * the user must enroll again before using the app (middleware enroll-first redirect).
 */
export async function POST(request) {
  try {
    const started = await startMfaRoute(request, 'mfa_recover');
    if (started instanceof NextResponse) return started;
    const { supabase, user } = started;

    const { code } = await request.json().catch(() => ({}));
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: AUTH_COPY.invalidRecoveryCode }, { status: 400 });
    }

    const spent = await fetchBackendAsCaller(request, '/api/v1/auth/mfa/recover', {
      method: 'POST',
      body: { code },
    });
    if (spent.status === 429) return NextResponse.json({ error: TOO_MANY_ATTEMPTS }, { status: 429 });
    if (!spent.ok) return NextResponse.json({ error: AUTH_COPY.invalidRecoveryCode }, { status: 400 });

    const adminClient = await createServerAdminClient();
    const { data: factors, error: listError } = await adminClient.auth.admin.mfa.listFactors({ userId: user.id });
    if (listError) throw new Error(listError.message);
    for (const factor of factors?.factors ?? []) {
      await adminClient.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
    }
    await adminClient.auth.admin.updateUserById(user.id, { app_metadata: { mfa_reenroll_required: true } });
    await supabase.auth.refreshSession();

    return NextResponse.json({ success: true, reenrollRequired: true });
  } catch (error) {
    console.error('Error using a recovery code:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
