import { Suspense } from 'react';
import { VerifyEmailPage } from '@/components/auth/verify-email/VerifyEmailPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.verify.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={1} />}>
      <VerifyEmailPage />
    </Suspense>
  );
}
