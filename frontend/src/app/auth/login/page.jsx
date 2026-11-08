import { Suspense } from 'react';
import { LoginPage } from '@/components/auth/login/LoginPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.login.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={2} />}>
      <LoginPage />
    </Suspense>
  );
}
