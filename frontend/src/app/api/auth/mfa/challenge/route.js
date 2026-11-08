import { NextResponse } from 'next/server';
import { startMfaRoute } from '@/lib/server/mfa';
import { AUTH_COPY } from '@/lib/copy/auth';

export async function POST(request) {
  try {
    const started = await startMfaRoute(request, 'mfa_verify');
    if (started instanceof NextResponse) return started;

    const { factorId } = await request.json().catch(() => ({}));
    if (!factorId || typeof factorId !== 'string') {
      return NextResponse.json({ error: 'Factor ID is required' }, { status: 400 });
    }

    const { data, error } = await started.supabase.auth.mfa.challenge({ factorId });
    if (error) return NextResponse.json({ error: AUTH_COPY.failed }, { status: 400 });
    return NextResponse.json({ challengeId: data.id });
  } catch (error) {
    console.error('Error creating MFA challenge:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
