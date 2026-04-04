/**
 * Server-side utility to fetch current user with app_metadata
 *
 * Used for server-side route gating in admin pages
 */

import { createSSRClient } from '@/lib/supabase/server';
import { checkMFAStatus } from '@/lib/utils/mfa-check';

/**
 * Get current user from Supabase session (server-side only)
 *
 * This is used for server-side route gating to prevent:
 * - UI flicker (showing admin content before permissions are known)
 * - Deep link access (direct URL access to admin pages)
 *
 * @returns User object with app_metadata or null if not authenticated
 */
export async function getMe() {
  try {
    const supabase = await createSSRClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    // Check MFA status
    const { currentLevel, requiresMFA } = await checkMFAStatus(supabase);

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError) {
      console.error('Failed to get JWT claims:', claimsError);
    }

    const customClaims = claimsData?.claims ?? {};

    // Merge custom JWT claims into app_metadata for consistent access
    const appMetadata = {
      ...user.app_metadata,
      hierarchy_level: customClaims.hierarchy_level,
      user_role: customClaims.user_role,
    };

    return {
      id: user.id,
      email: user.email || '',
      app_metadata: appMetadata,
      user_metadata: user.user_metadata,
      created_at: user.created_at,
      requiresMFA,
      currentAAL: currentLevel,
    };
  } catch {
    return null;
  }
}

/**
 * Get user claims for RBAC checks
 */
export function getUserClaims(user) {
  return {
    hierarchy_level: user?.app_metadata?.hierarchy_level,
    user_role: user?.app_metadata?.user_role,
  };
}
