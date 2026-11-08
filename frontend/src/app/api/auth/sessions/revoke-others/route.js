import { NextResponse } from 'next/server';
import { createSSRClient } from '@/lib/supabase/server';
import { enforceMFAForOperation } from '@/lib/utils/mfa-check';
import { enforceSameOrigin } from '@/lib/utils/origin';
import { enforceAuthRateLimit } from '@/lib/server/auth-guard';
import { recordAuthEvent } from '@/lib/server/auth-session';
import { AUTH_COPY } from '@/lib/copy/auth';

/** "Log out other sessions": every session of this user except the current one. */
export async function POST(request) {
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: AUTH_COPY.unauthorized }, { status: 401 });

  const limited = enforceAuthRateLimit(request, 'sessions', user.id);
  if (limited) return limited;
  const mfaError = await enforceMFAForOperation(supabase);
  if (mfaError) return mfaError;

  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) return NextResponse.json({ error: AUTH_COPY.failed }, { status: 400 });

  const { data: { session } } = await supabase.auth.getSession();
  if (session) await recordAuthEvent(session.access_token, 'sessions_revoked');
  return NextResponse.json({ message: AUTH_COPY.sessionsRevoked });
}
