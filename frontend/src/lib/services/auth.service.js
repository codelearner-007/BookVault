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

  // MFA Management
  async listMFAFactors() {
    return apiClient.get('/auth/mfa/factors');
  },

  async enrollMFAFactor(friendlyName) {
    return apiClient.post('/auth/mfa/enroll', { friendlyName });
  },

  async challengeMFAFactor(factorId) {
    return apiClient.post('/auth/mfa/challenge', { factorId });
  },

  async verifyMFAFactor(factorId, challengeId, code) {
    return apiClient.post('/auth/mfa/verify', { factorId, challengeId, code });
  },

  async unenrollMFAFactor(factorId) {
    return apiClient.post('/auth/mfa/unenroll', { factorId });
  },

  async generateRecoveryCodes() {
    return apiClient.post('/auth/mfa/recovery-codes');
  },

  async useRecoveryCode(code) {
    return apiClient.post('/auth/mfa/recover', { code });
  },

  async revokeOtherSessions() {
    return apiClient.post('/auth/sessions/revoke-others');
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
