import { apiClient } from './api-client';
import type {
  LoginCredentials,
  RegisterData,
  AuthResponse,
  ForgotPasswordData,
  ResetPasswordData,
  CurrentUserResponse,
  MFAStatusResponse,
  MFAFactorsResponse,
} from '@/lib/types/auth.types';

export const authService = {
  async getCurrentUser(): Promise<CurrentUserResponse> {
    return apiClient.get<CurrentUserResponse>('/auth/me');
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/auth/login', credentials);
  },

  async register(data: RegisterData): Promise<AuthResponse & { message?: string }> {
    return apiClient.post<AuthResponse & { message?: string }>('/auth/register', data);
  },

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    return apiClient.post('/auth/register', { email, resend: true });
  },

  async logout(): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/auth/logout');
  },

  async forgotPassword(data: ForgotPasswordData): Promise<{ message: string }> {
    return apiClient.post('/auth/forgot-password', data);
  },

  async resetPassword(data: ResetPasswordData): Promise<{ message: string }> {
    return apiClient.post('/auth/reset-password', data);
  },

  async exchangeCodeForSession(code: string): Promise<void> {
    await apiClient.post('/auth/callback', { code });
  },

  async setupMFA(): Promise<unknown> {
    return apiClient.post<unknown>('/auth/mfa/setup');
  },

  async verifyMFA(code: string): Promise<unknown> {
    return apiClient.post<unknown>('/auth/mfa/verify', { code });
  },

  // MFA Management
  async listMFAFactors(): Promise<MFAFactorsResponse> {
    return apiClient.get<MFAFactorsResponse>('/auth/mfa/factors');
  },

  async enrollMFAFactor(friendlyName: string): Promise<{ factorId: string; qrCode: string }> {
    return apiClient.post('/auth/mfa/enroll', { friendlyName });
  },

  async challengeMFAFactor(factorId: string): Promise<{ challengeId: string }> {
    return apiClient.post('/auth/mfa/challenge', { factorId });
  },

  async verifyMFAFactor(factorId: string, challengeId: string, code: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/mfa/verify', { factorId, challengeId, code });
  },

  async unenrollMFAFactor(factorId: string): Promise<{ success: boolean }> {
    return apiClient.post('/auth/mfa/unenroll', { factorId });
  },

  async getMFAStatus(): Promise<MFAStatusResponse> {
    return apiClient.get<MFAStatusResponse>('/auth/mfa/status');
  },

  // OAuth/SSO (client-side only - requires browser redirect)
  async signInWithOAuth(provider: 'github' | 'google' | 'facebook' | 'apple', redirectTo?: string): Promise<void> {
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
