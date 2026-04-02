'use client';

import { useState, useCallback } from 'react';
import { authService } from '@/lib/services/auth.service';

export function useMFA() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wrap in useCallback to prevent infinite loops when used as dependency
  const listFactors = useCallback(async () => {
    try {
      const data = await authService.listMFAFactors();
      return { success: true, factors: data.all, totp: data.totp };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch MFA factors';
      return { success: false, error: message, factors: [], totp: [] };
    }
  }, []); // No dependencies - authService is stable

  const enrollFactor = useCallback(async (friendlyName) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authService.enrollMFAFactor(friendlyName);
      return {
        success: true,
        factorId: data.factorId,
        qrCode: data.qrCode
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll MFA factor';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []); // setLoading/setError are stable from useState

  const challengeFactor = useCallback(async (factorId) => {
    try {
      const data = await authService.challengeMFAFactor(factorId);
      return { success: true, challengeId: data.challengeId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create MFA challenge';
      return { success: false, error: message };
    }
  }, []);

  const verifyFactor = useCallback(async (factorId, challengeId, code) => {
    setLoading(true);
    setError(null);
    try {
      await authService.verifyMFAFactor(factorId, challengeId, code);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify MFA code';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const unenrollFactor = useCallback(async (factorId) => {
    setLoading(true);
    setError(null);
    try {
      await authService.unenrollMFAFactor(factorId);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unenroll MFA factor';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    listFactors,
    enrollFactor,
    challengeFactor,
    verifyFactor,
    unenrollFactor,
    loading,
    error
  };
}
