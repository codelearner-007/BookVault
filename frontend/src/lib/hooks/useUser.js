'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { userService } from '@/lib/services/user.service';

export function useUser() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userService.getProfile();
      setProfile(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch profile';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await userService.updateProfile(data);
      setProfile(updated);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const response = await userService.changePassword(data);
      return { success: true, message: response.message };
    } catch (err) {
      // Check if error is MFA requirement
      const requiresMFA =
        (typeof err === 'object' && err !== null && 'requiresMFA' in err && err.requiresMFA) ||
        (err instanceof Error && err.message.includes('MFA verification required'));

      if (requiresMFA) {
        router.push('/auth/2fa?returnTo=/app/user-settings');
        return { success: false, error: 'MFA verification required', requiresMFA: true };
      }

      const message = err instanceof Error ? err.message : 'Failed to change password';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  return { profile, fetchProfile, updateProfile, changePassword, loading, error };
}
