import { NextResponse } from 'next/server';
import { hasRecentReauth, reauthRequiredResponse, startMfaRoute } from '@/lib/server/mfa';
import { AUTH_COPY } from '@/lib/copy/auth';

const FRIENDLY_NAME_MAX = 64;

/** Start TOTP enrollment: QR code plus the manual key. Needs a recent sign-in (or the password). */
export async function POST(request) {
  try {
    const started = await startMfaRoute(request, 'mfa_enroll');
    if (started instanceof NextResponse) return started;
    const { supabase, user } = started;

    const body = await request.json().catch(() => ({}));
    const friendlyName =
      typeof body.friendlyName === 'string' ? body.friendlyName.trim().slice(0, FRIENDLY_NAME_MAX) : '';
    if (!friendlyName) return NextResponse.json({ error: 'Friendly name is required' }, { status: 400 });
    if (!(await hasRecentReauth(supabase, user, body.password))) return reauthRequiredResponse();

    // An abandoned enrollment leaves an unverified factor behind; start clean.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (error) return NextResponse.json({ error: AUTH_COPY.failed }, { status: 400 });

    return NextResponse.json({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  } catch (error) {
    console.error('Error enrolling MFA factor:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
