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
    return apiClient.post('/auth/register', { email, resend: true });
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

  async exchangeCodeForSession(code) {
    await apiClient.post('/auth/callback', { code });
  },

  async setupMFA() {
    return apiClient.post('/auth/mfa/setup');
  },

  async verifyMFA(code) {
    return apiClient.post('/auth/mfa/verify', { code });
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
