'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/services/auth.service';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { AuthCard } from '@/components/auth/common/AuthCard';
import { ChangePasswordForm } from '@/components/forms/user/ChangePasswordForm';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_COPY } from '@/lib/copy/auth';
import { AUTH_ROUTES, returnPath, withReturnTo } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.mustChange;
const UNAUTHORIZED = 401;

// "Change password at next login" (D-30): the temporary password re-authenticates the change.
export function MustChangePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useGlobal();
  const { logout } = useAuth();
  const returnTo = returnPath(searchParams.get('returnTo'));

  const change = async (values) => {
    try {
      await authService.changePassword(values);
      await refreshUser();
      router.push(returnTo);
      return { success: true };
    } catch (err) {
      if (err.status === UNAUTHORIZED && err.message === AUTH_COPY.unauthorized) router.push(withReturnTo(AUTH_ROUTES.login, returnTo));
      if (err.requiresMFA) router.push(withReturnTo(AUTH_ROUTES.mfa, AUTH_ROUTES.changePassword));
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthCard
      title={COPY.title}
      lede={COPY.lede}
      alt={<Button variant="link" onClick={() => void logout()}>{AUTH_UI_COPY.common.logOut}</Button>}
    >
      <ChangePasswordForm onSubmit={change} currentLabel={COPY.current} submitLabel={COPY.submit} fullWidth />
    </AuthCard>
  );
}
