import { createServerClient } from '@supabase/ssr'

export async function createServerAdminClient() {

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.PRIVATE_SUPABASE_SERVICE_KEY,
        {
            cookies: {
                getAll: () => [],
                setAll: () => {},
            },
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
            db: {
                schema: 'public'
            },
        }
    )
}

/**
 * Revoke all sessions for a specific user via GoTrue admin API.
 * This forces the user to re-authenticate on all devices.
 */
export async function revokeAllUserSessions(userId) {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/logout`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.PRIVATE_SUPABASE_SERVICE_KEY}`,
            'apikey': process.env.PRIVATE_SUPABASE_SERVICE_KEY,
        },
    });
    if (!res.ok) {
        console.error(`Failed to revoke sessions for user ${userId}: ${res.status}`);
    }
}
