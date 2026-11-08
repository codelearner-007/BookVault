import { Suspense } from 'react';
import { SignupPage } from '@/components/auth/signup/SignupPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.register.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={5} />}>
      <SignupPage />
    </Suspense>
  );
}
