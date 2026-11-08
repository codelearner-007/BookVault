'use client';

import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { LoginForm } from '@/components/forms/auth/LoginForm';
import SSOButtons from '@/components/auth/SSOButtons';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES, returnPath } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.login;
// ?error= values the auth callback sets when an emailed link cannot be used.
const LINK_ERRORS = ['invalid_code', 'link_invalid'];

export function LoginPage() {
  const searchParams = useSearchParams();
  const { login, loading } = useAuth();
  const returnTo = returnPath(searchParams.get('returnTo'));
  const linkInvalid = LINK_ERRORS.includes(searchParams.get('error'));

  return (
    <AuthCard
      title={COPY.title}
      lede={COPY.lede}
      alt={<>{COPY.alt} <AuthLink href={AUTH_ROUTES.register}>{COPY.altLink}</AuthLink></>}
      note={COPY.note}
    >
      {linkInvalid && (
        <Alert variant="warn" className="mb-5">
          <AlertDescription>{COPY.linkInvalid}</AlertDescription>
        </Alert>
      )}
      <LoginForm onSubmit={(values) => login(values, returnTo)} loading={loading} />
      <SSOButtons />
    </AuthCard>
  );
}
