import { Suspense } from 'react';
import { EnrolFirstPage } from '@/components/auth/enroll/EnrolFirstPage';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';

export const metadata = { title: AUTH_UI_COPY.enrolFirst.title };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton fields={1} />}>
      <EnrolFirstPage />
    </Suspense>
  );
}
