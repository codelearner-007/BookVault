'use client';

import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

export default function AuthError({ error, reset }) {
  useEffect(() => {
    console.error('Auth error boundary caught:', error);
  }, [error]);

  return (
    <AuthCard
      icon={CircleAlert}
      title={AUTH_UI_COPY.errorPage.title}
      lede={AUTH_UI_COPY.errorPage.lede}
      alt={<AuthLink href={AUTH_ROUTES.login}>{AUTH_UI_COPY.common.backToLogin}</AuthLink>}
    >
      <Button className="w-full" onClick={reset}>{AUTH_UI_COPY.errorPage.retry}</Button>
    </AuthCard>
  );
}
