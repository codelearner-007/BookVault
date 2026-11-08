'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/services/auth.service';
import { RegisterForm } from '@/components/forms/auth/RegisterForm';
import SSOButtons from '@/components/auth/SSOButtons';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { rememberPendingEmail } from '@/components/auth/verify-email/pending-email';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.register;

export function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const register = async (values) => {
    setLoading(true);
    try {
      await authService.register(values);
      rememberPendingEmail(values.email);
      router.push(AUTH_ROUTES.verify);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={COPY.title}
      lede={COPY.lede}
      alt={<>{COPY.alt} <AuthLink href={AUTH_ROUTES.login}>{COPY.altLink}</AuthLink></>}
    >
      <RegisterForm onSubmit={register} loading={loading} />
      <SSOButtons />
    </AuthCard>
  );
}
