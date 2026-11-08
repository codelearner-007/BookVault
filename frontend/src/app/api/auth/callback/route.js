// src/app/api/auth/callback/route.js
import { NextResponse } from 'next/server'
import { createSSRClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

const RESET_PAGE = '/auth/reset-password'
const VERIFY_PAGE = '/auth/verify-email'

// Where a used or expired emailed link lands: the page that explains it and offers a new link.
function failedLinkTarget(next, hadCode) {
    if (next.startsWith(RESET_PAGE)) return `${RESET_PAGE}?status=invalid`
    if (hadCode) return '/auth/login?error=invalid_code'
    return `${VERIFY_PAGE}?status=expired`
}

export async function GET(request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const rawNext = requestUrl.searchParams.get('next')
    const next = safeRedirectPath(rawNext)

    if (!code) {
        // GoTrue sends error_code (e.g. otp_expired) instead of a code when the link can't be used.
        const target = requestUrl.searchParams.has('error_code') ? failedLinkTarget(next, false) : '/auth/login'
        return NextResponse.redirect(new URL(target, request.url))
    }

    const supabase = await createSSRClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
        console.error('Code exchange error:', error.message)
        return NextResponse.redirect(new URL(failedLinkTarget(next, true), request.url))
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
