'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MailCheck, MailX } from 'lucide-react';
import { authService } from '@/lib/services/auth.service';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { ResendVerificationForm } from '@/components/forms/auth/ResendVerificationForm';
import { linkFailedInUrl, readPendingEmail } from './pending-email';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.verify;

// Pending (after signup) or expired (a used or old link); both offer a resend with a cooldown.
export function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setEmail(readPendingEmail());
    setExpired(linkFailedInUrl(searchParams));
  }, [searchParams]);

  const pendingLede = email ? COPY.ledeFor(email) : COPY.lede;

  return (
    <AuthCard
      icon={expired ? MailX : MailCheck}
      title={expired ? COPY.expiredTitle : COPY.title}
      lede={expired ? COPY.expiredLede : pendingLede}
      alt={<AuthLink href={AUTH_ROUTES.login}>{AUTH_UI_COPY.common.backToLogin}</AuthLink>}
    >
      {!expired && <p className="mb-4 text-center text-sm text-muted-foreground">{COPY.resendLabel}</p>}
      <ResendVerificationForm
        defaultEmail={email}
        variant={expired ? 'default' : 'secondary'}
        onSubmit={(address) => authService.resendVerificationEmail(address)}
      />
    </AuthCard>
  );
}
