/**
 * Check if user has verified MFA factors and current AAL level
 * @param supabase - Supabase client instance
 * @returns MFA status information
 */
export async function checkMFAStatus(supabase) {
  try {
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

    const currentLevel = aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1';

    // Check if user has any verified MFA factors
    const hasVerifiedMFA =
      factors?.totp?.some((f) => f.status === 'verified') ||
      factors?.phone?.some((f) => f.status === 'verified') ||
      false;

    // User requires MFA if they have verified factors but current session is only AAL1
    const requiresMFA = hasVerifiedMFA && currentLevel === 'aal1';

    return { hasVerifiedMFA, currentLevel, requiresMFA };
  } catch (error) {
    console.error('MFA check error:', error);
    // Fail open: don't lock users out if MFA APIs error
    return { hasVerifiedMFA: false, currentLevel: 'aal1', requiresMFA: false };
  }
}

/**
 * Enforce MFA verification for operations requiring AAL2
 * Returns error response if MFA is required but not verified
 * @param supabase - Supabase client instance
 * @returns Response with error if MFA required, null if check passes
 */
export async function enforceMFAForOperation(supabase) {
  const { hasVerifiedMFA, currentLevel } = await checkMFAStatus(supabase);

  if (hasVerifiedMFA && currentLevel !== 'aal2') {
    return Response.json(
      { error: 'MFA verification required', requiresMFA: true },
      { status: 403 }
    );
  }

  return null; // Check passed
}
