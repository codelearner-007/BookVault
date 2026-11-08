'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LinkIcon } from 'lucide-react';
import { authService } from '@/lib/services/auth.service';
import { ResetPasswordForm } from '@/components/forms/auth/ResetPasswordForm';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';
import { linkFailedInUrl } from '@/components/auth/verify-email/pending-email';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES, withReturnTo } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.reset;
const STATE = { checking: 'checking', ready: 'ready', invalid: 'invalid' };

// The emailed link opens a recovery session (auth callback); without one the link was used or expired.
async function recoveryState(searchParams) {
  if (linkFailedInUrl(searchParams)) return { state: STATE.invalid };
  try {
    const me = await authService.getCurrentUser();
    if (!me.user) return { state: STATE.invalid };
    return { state: STATE.ready, requiresMFA: Boolean(me.requiresMFA) };
  } catch {
    return { state: STATE.invalid };
  }
}

export function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState(STATE.checking);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    recoveryState(searchParams).then((result) => {
      if (!active) return;
      // A user with 2FA finishes the second step before the password can change.
      if (result.requiresMFA) router.replace(withReturnTo(AUTH_ROUTES.mfa, AUTH_ROUTES.reset));
      else setState(result.state);
    });
    return () => {
      active = false;
    };
  }, [router, searchParams]);

  const save = async (values) => {
    setLoading(true);
    try {
      await authService.resetPassword(values);
      router.push(AUTH_ROUTES.home);
      return { success: true };
    } catch (err) {
      if (err.status === 401) setState(STATE.invalid);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  if (state === STATE.checking) return <AuthCardSkeleton fields={2} />;

  const backToLogin = <AuthLink href={AUTH_ROUTES.login}>{AUTH_UI_COPY.common.backToLogin}</AuthLink>;
  if (state === STATE.invalid) {
    return (
      <AuthCard icon={LinkIcon} title={COPY.invalidTitle} lede={COPY.invalidLede} alt={backToLogin}>
        <Button asChild className="w-full">
          <Link href={AUTH_ROUTES.forgot}>{COPY.requestNew}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={COPY.title} lede={COPY.lede} alt={backToLogin}>
      <ResetPasswordForm onSubmit={save} loading={loading} />
    </AuthCard>
  );
}
