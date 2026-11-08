import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/lib/supabase/serverAdminClient';
import { startMfaRoute } from '@/lib/server/mfa';
import { recordAuthEvent } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';

/** Verify a TOTP code: the login challenge, or the last step of an enrollment. */
export async function POST(request) {
  try {
    const started = await startMfaRoute(request, 'mfa_verify');
    if (started instanceof NextResponse) return started;
    const { supabase, user } = started;

    const { factorId, challengeId, code } = await request.json().catch(() => ({}));
    if (!factorId || !challengeId || !code) {
      return NextResponse.json({ error: 'Factor ID, challenge ID, and code are required' }, { status: 400 });
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const enrolling = (factors?.all ?? []).some((f) => f.id === factorId && f.status === 'unverified');

    const { data: verified, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (error) return NextResponse.json({ error: AUTH_COPY.invalidCode }, { status: 400 });

    if (enrolling) {
      await recordAuthEvent(verified.access_token, 'mfa_enrolled');
      if (user.app_metadata?.mfa_reenroll_required) {
        const adminClient = await createServerAdminClient();
        await adminClient.auth.admin.updateUserById(user.id, { app_metadata: { mfa_reenroll_required: false } });
        await supabase.auth.refreshSession();
      }
    }
    return NextResponse.json({ success: true, enrolled: enrolling });
  } catch (error) {
    console.error('Error verifying MFA code:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
