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
    if (user && user.user && isProtectedArea) {
        try {
            const { hasVerifiedMFA, currentLevel } = await checkMFAStatus(supabase)

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
        const userRole = jwtClaims.user_role ?? 'admin'
        const isSuperAdmin = userRole === 'super_admin'

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

        // /admin/* — super_admin should use /super-admin instead
        if (pathname.startsWith('/admin') && isSuperAdmin) {
            const url = request.nextUrl.clone()
            url.pathname = '/super-admin'
            return NextResponse.redirect(url)
        }
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

function normalizePermissions(value) {
    if (!Array.isArray(value)) return []
    return value.filter((p) => typeof p === 'string' && p.includes(':'))
}
