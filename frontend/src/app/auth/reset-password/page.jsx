import { Suspense } from 'react';
import { ResetPasswordPage } from '@/components/auth/reset-password/ResetPasswordPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.reset.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={2} />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
