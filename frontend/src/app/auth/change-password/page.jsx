import { Suspense } from 'react';
import { MustChangePasswordPage } from '@/components/auth/change-password/MustChangePasswordPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.mustChange.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={3} />}>
      <MustChangePasswordPage />
    </Suspense>
  );
}
