'use client';

import { useRouter } from 'next/navigation';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { AuthCard } from '@/components/auth/common/AuthCard';
import { MfaEnrollment } from '@/components/auth/mfa/MfaEnrollment';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.enrolFirst;

// Enrol first (B0.7): the super admin, and a user who spent a recovery code, set up TOTP here.
export function EnrolFirstPage() {
  const router = useRouter();
  const { refreshUser } = useGlobal();
  const { logout } = useAuth();

  const done = async () => {
    await refreshUser();
    router.push(AUTH_ROUTES.home);
  };

  return (
    <AuthCard
      title={COPY.title}
      lede={COPY.lede}
      alt={<Button variant="link" onClick={() => void logout()}>{AUTH_UI_COPY.common.logOut}</Button>}
    >
      <MfaEnrollment onDone={() => void done()} doneLabel={COPY.done} />
    </AuthCard>
  );
}
