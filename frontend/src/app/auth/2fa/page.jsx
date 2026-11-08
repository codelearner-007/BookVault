import { Suspense } from 'react';
import { MFAVerificationPage } from '@/components/auth/mfa/MFAVerificationPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.mfa.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={1} />}>
      <MFAVerificationPage />
    </Suspense>
  );
}
