import { apiClient } from './api-client';

export const authService = {
  async getCurrentUser() {
    return apiClient.get('/auth/me');
  },

  async login(credentials) {
    return apiClient.post('/auth/login', credentials);
  },

  async register(data) {
    return apiClient.post('/auth/register', data);
  },

  async resendVerificationEmail(email) {
    return apiClient.post('/auth/resend-verification', { email });
  },

  async logout() {
    return apiClient.post('/auth/logout');
  },

  async forgotPassword(data) {
    return apiClient.post('/auth/forgot-password', data);
  },

  async resetPassword(data) {
    return apiClient.post('/auth/reset-password', data);
  },

  async changePassword(data) {
    return apiClient.post('/auth/change-password', data);
  },

  // MFA Management
  async listMFAFactors() {
    return apiClient.get('/auth/mfa/factors');
  },

  // password is needed only when the sign-in is not recent (403 code reauth_required).
  async enrollMFAFactor(friendlyName, password) {
    return apiClient.post('/auth/mfa/enroll', { friendlyName, ...(password ? { password } : {}) });
  },

  async challengeMFAFactor(factorId) {
    return apiClient.post('/auth/mfa/challenge', { factorId });
  },

  async verifyMFAFactor(factorId, challengeId, code) {
    return apiClient.post('/auth/mfa/verify', { factorId, challengeId, code });
  },

  async unenrollMFAFactor(factorId, password) {
    return apiClient.post('/auth/mfa/unenroll', { factorId, password });
  },

  async generateRecoveryCodes() {
    return apiClient.post('/auth/mfa/recovery-codes');
  },

  async getRecoveryCodeStatus() {
    return apiClient.get('/auth/mfa/recovery-codes');
  },

  async redeemRecoveryCode(code) {
    return apiClient.post('/auth/mfa/recover', { code });
  },

  async revokeOtherSessions() {
    return apiClient.post('/auth/sessions/revoke-others');
  },

  // Challenge + verify in one step: the login challenge, an enrollment, or a confirmation.
  async verifyTotpCode(factorId, code) {
    const { challengeId } = await this.challengeMFAFactor(factorId);
    return this.verifyMFAFactor(factorId, challengeId, code);
  },

  // The user's verified TOTP factor, or null when 2FA is off.
  async getVerifiedTotpFactor() {
    const { totp } = await this.listMFAFactors();
    return (totp ?? []).find((factor) => factor.status === 'verified') ?? null;
  },

  async getMFAStatus() {
    return apiClient.get('/auth/mfa/status');
  },

  // OAuth/SSO (client-side only - requires browser redirect)
  async signInWithOAuth(provider, redirectTo) {
    // OAuth requires client-side Supabase client for redirect
    const { createSPAClient } = await import('@/lib/supabase/client');
    const supabase = createSPAClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) throw error;
  },
};
