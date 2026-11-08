import { Suspense } from 'react';
import { ForgotPasswordPage } from '@/components/auth/forgot-password/ForgotPasswordPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.forgot.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={1} />}>
      <ForgotPasswordPage />
    </Suspense>
  );
}
