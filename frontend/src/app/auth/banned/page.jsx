import { Suspense } from 'react';
import { BannedPage } from '@/components/auth/banned/BannedPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.banned.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={0} />}>
      <BannedPage />
    </Suspense>
  );
}
