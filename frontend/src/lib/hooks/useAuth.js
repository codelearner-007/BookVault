'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobal } from '@/lib/context/GlobalContext';
import { authService } from '@/lib/services/auth.service';
import { AUTH_ROUTES, nextAfterLogin } from '@/lib/utils/auth-routes';

// Sign-in and sign-out, keeping the global auth state in step.
export function useAuth() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { clearUser, setAuthFromLogin } = useGlobal();

  const login = async (credentials, returnTo) => {
    setLoading(true);
    try {
      const response = await authService.login(credentials);
      setAuthFromLogin({ user: response.user ?? null, mfaRequired: Boolean(response.requiresMFA) });
      router.push(nextAfterLogin(response, returnTo));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Always lands on the login page (or `target`): a failed call still leaves no usable session here.
  const logout = async (target = AUTH_ROUTES.login) => {
    setLoading(true);
    try {
      await authService.logout();
    } finally {
      clearUser();
      setLoading(false);
      router.push(target);
    }
  };

  return { login, logout, loading };
}
