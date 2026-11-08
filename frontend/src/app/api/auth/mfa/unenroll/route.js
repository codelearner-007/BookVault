import { NextResponse } from 'next/server';
import { enforceMFAForOperation } from '@/lib/utils/mfa-check';
import { startMfaRoute } from '@/lib/server/mfa';
import { verifyPassword } from '@/lib/server/auth-session';
import { fetchBackendWithToken } from '@/lib/server/backend';
import { AUTH_COPY } from '@/lib/copy/auth';

/** Turn 2FA off: needs an AAL2 session and the current password. Audited via GoTrue's log. */
export async function POST(request) {
  try {
    const started = await startMfaRoute(request, 'mfa_unenroll');
    if (started instanceof NextResponse) return started;
    const { supabase, user } = started;

    const mfaError = await enforceMFAForOperation(supabase);
    if (mfaError) return mfaError;

    const { factorId, password } = await request.json().catch(() => ({}));
    if (!factorId || typeof factorId !== 'string') {
      return NextResponse.json({ error: 'Factor ID is required' }, { status: 400 });
    }
    if (!(await verifyPassword(user.email, typeof password === 'string' ? password : ''))) {
      return NextResponse.json({ error: AUTH_COPY.currentPasswordWrong }, { status: 401 });
    }

    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return NextResponse.json({ error: AUTH_COPY.failed }, { status: 400 });

    // Without a verified factor the recovery codes mean nothing; FastAPI refuses while one remains.
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      await fetchBackendWithToken(refreshed.session.access_token, '/api/v1/auth/mfa/recovery-codes', {
        method: 'DELETE',
      });
    }
    return NextResponse.json({ success: true, message: AUTH_COPY.mfaDisabled });
  } catch (error) {
    console.error('Error unenrolling MFA factor:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
