import { NextResponse } from 'next/server';
import { AUTH_CONFIG } from '@/lib/server/auth-config';

/** Enabled sign-in methods (env AUTH_METHODS), so the UI never hardcodes providers. */
export async function GET() {
  return NextResponse.json({ methods: AUTH_CONFIG.methods });
}
