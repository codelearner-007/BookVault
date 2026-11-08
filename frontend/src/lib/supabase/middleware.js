import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { checkMFAStatus } from '@/lib/utils/mfa-check'

export async function updateSession(request) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Do not run code between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    // IMPORTANT: DO NOT REMOVE auth.getUser()

    const {data: user} = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    // Check if user is banned — redirect to banned page
    const isBanned = user?.user?.banned_until && new Date(user.user.banned_until) > new Date()
    if (isBanned && pathname !== '/auth/banned' && !pathname.startsWith('/api/auth/logout')) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/banned'
        return NextResponse.redirect(url)
    }
    const isProtectedArea =
        pathname.startsWith('/app') ||
        pathname.startsWith('/admin') ||
        pathname.startsWith('/super-admin')

    if ((!user || !user.user) && isProtectedArea) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/login'
        url.searchParams.set('returnTo', pathname)
        return NextResponse.redirect(url)
    }

    // MFA enforcement for authenticated users accessing protected routes
    let mfaStatus = null
    if (user && user.user && isProtectedArea) {
        try {
            mfaStatus = await checkMFAStatus(supabase)
            const { hasVerifiedMFA, currentLevel } = mfaStatus

            // If user has MFA but hasn't verified it this session (AAL1), redirect to MFA page
            if (hasVerifiedMFA && currentLevel !== 'aal2') {
                const url = request.nextUrl.clone()
                url.pathname = '/auth/2fa'
                url.searchParams.set('returnTo', pathname)
                return NextResponse.redirect(url)
            }
        } catch (error) {
            console.error('MFA middleware error:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                pathname: request.nextUrl.pathname,
                userId: user?.user?.id,
                timestamp: new Date().toISOString(),
            });
            // Fail CLOSED: redirect to login when MFA status cannot be determined.
            const url = request.nextUrl.clone()
            url.pathname = '/auth/login'
            return NextResponse.redirect(url)
        }
    }

    // Role-based dashboard routing and cross-access guards
    if (user && user.user && isProtectedArea) {
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
        if (claimsError) {
            console.error('Failed to get JWT claims in middleware:', claimsError)
        }

        const jwtClaims = claimsData?.claims ?? {}
        // Fail closed: no role claim (no user_roles row) never defaults to a role.
        const userRole = jwtClaims.user_role
        if (!userRole) {
            const url = request.nextUrl.clone()
            url.pathname = '/forbidden'
            return NextResponse.redirect(url)
        }
        const isSuperAdmin = userRole === 'super_admin'

        // Business users created with "must change password at next login" (D-30):
        // every protected page leads to the profile page until the password is changed.
        const profilePath = isSuperAdmin ? '/super-admin/profile' : '/admin/profile'
        if (user.user.app_metadata?.must_change_password && !pathname.startsWith(profilePath)) {
            const url = request.nextUrl.clone()
            url.pathname = profilePath
            return NextResponse.redirect(url)
        }

        // Enroll first (B0.7): the super admin always needs AAL2 (FastAPI enforces it on
        // platform routes), and a user who spent a recovery code must enroll again (D-23).
        // Users with a verified factor were already sent to /auth/2fa above.
        const mustEnroll =
            (isSuperAdmin || user.user.app_metadata?.mfa_reenroll_required) && !mfaStatus?.hasVerifiedMFA
        if (mustEnroll && !pathname.startsWith(profilePath)) {
            const url = request.nextUrl.clone()
            url.pathname = profilePath
            url.search = ''
            url.searchParams.set('enrollMfa', '1')
            return NextResponse.redirect(url)
        }

        // /app/* — legacy shell: redirect to role-appropriate dashboard
        if (pathname.startsWith('/app')) {
            const url = request.nextUrl.clone()
            url.pathname = isSuperAdmin ? '/super-admin' : '/admin'
            return NextResponse.redirect(url)
        }

        // /super-admin/* — only super_admin allowed
        if (pathname.startsWith('/super-admin') && !isSuperAdmin) {
            const url = request.nextUrl.clone()
            url.pathname = '/admin'
            return NextResponse.redirect(url)
        }
        // /admin/* is open to super_admin too (CS-25): the Platform area stays under /super-admin.
    }

    // IMPORTANT: You *must* return the supabaseResponse object as it is.
    // If you're creating a new response object with NextResponse.next() make sure to:
    // 1. Pass the request in it, like so:
    //    const myNewResponse = NextResponse.next({ request })
    // 2. Copy over the cookies, like so:
    //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
    // 3. Change the myNewResponse object to fit your needs, but avoid changing
    //    the cookies!
    // 4. Finally:
    //    return myNewResponse
    // If this is not done, you may be causing the browser and server to go out
    // of sync and terminate the user's session prematurely!

    return supabaseResponse
}
