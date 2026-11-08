'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/services/auth.service';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useAuth } from '@/lib/hooks/useAuth';
import { AuthCard } from '@/components/auth/common/AuthCard';
import { AuthCardSkeleton } from '@/components/auth/common/AuthCardSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TOTP_LENGTH, TotpCodeField } from './TotpCodeField';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES, returnPath } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.mfa;
const MODE = { app: 'app', recovery: 'recovery' };
const RECOVERY_ID = 'recovery-code';

function useSubmit(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const run = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || AUTH_UI_COPY.common.unexpected);
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

function TotpForm({ factorId, onDone }) {
  const [code, setCode] = useState('');
  const submit = useSubmit(async () => {
    await authService.verifyTotpCode(factorId, code);
    await onDone();
  });
  const onSubmit = (event) => {
    if (code.length !== TOTP_LENGTH) {
      event.preventDefault();
      submit.setError(COPY.codeLength);
      return;
    }
    submit.run(event);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <TotpCodeField value={code} onChange={setCode} error={submit.error} autoFocus />
      <Button type="submit" className="w-full" disabled={submit.pending}>
        {submit.pending ? COPY.submitting : COPY.submit}
      </Button>
    </form>
  );
}

function RecoveryForm({ onDone }) {
  const [code, setCode] = useState('');
  const submit = useSubmit(async () => {
    await authService.redeemRecoveryCode(code.trim());
    onDone();
  });

  return (
    <form onSubmit={submit.run} className="grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor={RECOVERY_ID}>{COPY.recoveryCode}</Label>
        <Input
          id={RECOVERY_ID}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(submit.error)}
        />
        {submit.error && <p role="alert" className="text-sm text-bad">{submit.error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={submit.pending || !code.trim()}>
        {submit.pending ? COPY.submitting : COPY.recoverySubmit}
      </Button>
    </form>
  );
}

// The second sign-in step: the TOTP code, or a recovery code that resets 2FA (D-23).
export function MFAVerificationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useGlobal();
  const { logout } = useAuth();
  const [factorId, setFactorId] = useState(null);
  const [mode, setMode] = useState(MODE.app);
  const returnTo = returnPath(searchParams.get('returnTo'));

  useEffect(() => {
    let active = true;
    (async () => {
      const status = await authService.getMFAStatus().catch(() => null);
      if (!active) return;
      if (!status) return router.replace(AUTH_ROUTES.login);
      if (status.currentLevel === 'aal2' || status.nextLevel === 'aal1') return router.replace(returnTo);
      const factor = await authService.getVerifiedTotpFactor().catch(() => null);
      if (active) setFactorId(factor?.id ?? '');
    })();
    return () => {
      active = false;
    };
  }, [router, returnTo]);

  const verified = async () => {
    await refreshUser();
    router.push(returnTo);
  };

  if (factorId === null) return <AuthCardSkeleton fields={1} />;

  const recovery = mode === MODE.recovery;
  return (
    <AuthCard
      title={recovery ? COPY.recoveryTitle : COPY.title}
      lede={recovery ? COPY.recoveryLede : COPY.lede}
      alt={(
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Button variant="link" onClick={() => setMode(recovery ? MODE.app : MODE.recovery)}>
            {recovery ? COPY.useApp : COPY.useRecovery}
          </Button>
          <Button variant="link" onClick={() => void logout()}>{AUTH_UI_COPY.common.logOut}</Button>
        </div>
      )}
    >
      {recovery && <RecoveryForm onDone={() => router.push(AUTH_ROUTES.enrolFirst)} />}
      {!recovery && factorId && <TotpForm factorId={factorId} onDone={verified} />}
      {!recovery && !factorId && <p className="text-center text-sm text-muted-foreground">{COPY.noFactor}</p>}
    </AuthCard>
  );
}
