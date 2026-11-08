import { NextResponse } from 'next/server';
import { fetchBackendAsCaller } from '@/lib/server/backend';
import { startMfaRoute } from '@/lib/server/mfa';
import { createSSRClient } from '@/lib/supabase/server';
import { AUTH_COPY } from '@/lib/copy/auth';

const RECOVERY_CODES_PATH = '/api/v1/auth/mfa/recovery-codes';

async function relay(response) {
  const body = await response.json().catch(() => ({}));
  if (response.ok) return NextResponse.json(body, { status: response.status });
  const code = body?.details?.code;
  const error = code === 'reauth_required' ? AUTH_COPY.reauthRequired : body?.error || AUTH_COPY.failed;
  return NextResponse.json({ error, code }, { status: response.status });
}

/** New recovery codes (replaces the old set); shown once. FastAPI checks AAL2 + recent sign-in. */
export async function POST(request) {
  const started = await startMfaRoute(request, 'mfa_enroll');
  if (started instanceof NextResponse) return started;
  return relay(await fetchBackendAsCaller(request, RECOVERY_CODES_PATH, { method: 'POST' }));
}

/** How many unused codes are left. */
export async function GET(request) {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: AUTH_COPY.unauthorized }, { status: 401 });
  return relay(await fetchBackendAsCaller(request, RECOVERY_CODES_PATH));
}
