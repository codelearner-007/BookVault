// src/app/api/auth/callback/route.js
import { NextResponse } from 'next/server'
import { createSSRClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export async function GET(request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const rawNext = requestUrl.searchParams.get('next')
    const next = safeRedirectPath(rawNext)

    if (!code) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    const supabase = await createSSRClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
        console.error('Code exchange error:', error.message)
        return NextResponse.redirect(new URL('/auth/login?error=invalid_code', request.url))
    }

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalError) {
        console.error('Error checking MFA status:', aalError)
        return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    if (aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
        return NextResponse.redirect(new URL(`/auth/2fa?returnTo=${encodeURIComponent(next)}`, request.url))
    }

    return NextResponse.redirect(new URL(next, request.url))
}
