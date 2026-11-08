/**
 * MFA status of the session: verified factors and the current AAL.
 * Throws when Supabase cannot answer, so every caller fails CLOSED.
 * @param supabase - Supabase client instance
 */
export async function checkMFAStatus(supabase) {
  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aalError || factorsError) {
    throw new Error(`MFA status unavailable: ${(aalError || factorsError).message}`);
  }

  const currentLevel = aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1';
  const hasVerifiedMFA =
    factors?.totp?.some((f) => f.status === 'verified') ||
    factors?.phone?.some((f) => f.status === 'verified') ||
    false;

  // Verified factors but an AAL1 session: the second step is still owed.
  const requiresMFA = hasVerifiedMFA && currentLevel === 'aal1';

  return { hasVerifiedMFA, currentLevel, requiresMFA };
}

/**
 * 403 unless the session is AAL2 whenever the user has a verified factor (fails closed).
 * @param supabase - Supabase client instance
 * @returns Response with error if MFA required, null if check passes
 */
export async function enforceMFAForOperation(supabase) {
  try {
    const { requiresMFA } = await checkMFAStatus(supabase);
    if (!requiresMFA) return null;
  } catch (error) {
    console.error('MFA check failed:', error.message);
  }
  return Response.json({ error: 'MFA verification required', requiresMFA: true }, { status: 403 });
}
