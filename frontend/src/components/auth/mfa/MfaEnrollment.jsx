'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { authService } from '@/lib/services/auth.service';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/common/PasswordInput';
import { RecoveryCodesPanel } from './RecoveryCodesPanel';
import { TOTP_LENGTH, TotpCodeField } from './TotpCodeField';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.enrol;
const REAUTH_REQUIRED = 'reauth_required';
const QR_SIZE = 176;
const STEP = { starting: 'starting', password: 'password', scan: 'scan', codes: 'codes', codesFailed: 'codesFailed' };
const PASSWORD_ID = 'enrol-password';

// GoTrue returns "data:image/svg+xml;utf-8,<svg…>" unencoded; encode the markup so the URL is valid.
function qrDataUrl(raw) {
  const comma = raw.indexOf(',');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw.slice(comma + 1))}`;
}

function PasswordStep({ onSubmit, error, pending }) {
  const [password, setPassword] = useState('');
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(password);
      }}
    >
      <p className="text-sm text-muted-foreground">{COPY.passwordNeeded}</p>
      <div className="grid gap-2">
        <Label htmlFor={PASSWORD_ID}>{AUTH_UI_COPY.common.password}</Label>
        <PasswordInput id={PASSWORD_ID} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={pending || !password}>
        {pending ? COPY.starting : COPY.start}
      </Button>
    </form>
  );
}

function ScanStep({ enrollment, onVerify }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const verify = async (event) => {
    event.preventDefault();
    if (code.length !== TOTP_LENGTH) return setError(AUTH_UI_COPY.mfa.codeLength);
    setPending(true);
    setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(enrollment.secret);
    setCopied(true);
  };

  return (
    <form className="grid gap-5" onSubmit={verify} noValidate>
      <p className="text-sm text-muted-foreground">{COPY.scanStep}</p>
      <div className="flex justify-center">
        {/* The QR is dark on transparent: keep a light ground under it in both themes. */}
        <div className="rounded-control bg-popover p-3 dark:bg-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- an inline data: SVG from GoTrue; next/image rejects it */}
          <img src={qrDataUrl(enrollment.qrCode)} alt={COPY.qrAlt} width={QR_SIZE} height={QR_SIZE} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{COPY.manualLabel}</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-control bg-muted px-3 py-2 font-mono text-sm">{enrollment.secret}</code>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={copied ? COPY.copied : COPY.copyKey} onClick={() => void copyKey()}>
            <Copy />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{COPY.codeStep}</p>
      <TotpCodeField value={code} onChange={setCode} error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? COPY.verifying : COPY.verify}
      </Button>
    </form>
  );
}

function EnrollmentSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="mx-auto size-48 rounded-control" />
      <Skeleton className="h-9 w-full rounded-control" />
      <Skeleton className="h-control w-full rounded-control" />
      <Skeleton className="h-control w-full rounded-full" />
    </div>
  );
}

/*
  TOTP enrolment (Security and the enrol-first page): QR + manual key, verify a code, then
  the recovery codes once. A sign-in older than the re-auth window asks for the password.
*/
export function MfaEnrollment({ onDone, doneLabel }) {
  const [step, setStep] = useState(STEP.starting);
  const [enrollment, setEnrollment] = useState(null);
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  const start = useCallback(async (password) => {
    setPending(true);
    setError('');
    try {
      setEnrollment(await authService.enrollMFAFactor(COPY.nameDefault, password));
      setStep(STEP.scan);
    } catch (err) {
      setStep(STEP.password);
      if (err.code !== REAUTH_REQUIRED || password) setError(err.message);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  const verify = async (code) => {
    await authService.verifyTotpCode(enrollment.factorId, code);
    try {
      const generated = await authService.generateRecoveryCodes();
      setCodes(generated.codes);
      setStep(STEP.codes);
    } catch {
      setStep(STEP.codesFailed);
    }
  };

  if (step === STEP.starting) return <EnrollmentSkeleton />;
  if (step === STEP.password) return <PasswordStep onSubmit={start} error={error} pending={pending} />;
  if (step === STEP.scan) return <ScanStep enrollment={enrollment} onVerify={verify} />;
  if (step === STEP.codes) return <RecoveryCodesPanel codes={codes} onDone={onDone} doneLabel={doneLabel} />;
  return (
    <div className="grid gap-5">
      <Alert variant="warn">
        <AlertDescription>{COPY.codesFailed}</AlertDescription>
      </Alert>
      <Button type="button" className="w-full" onClick={onDone}>{doneLabel ?? AUTH_UI_COPY.common.continue}</Button>
    </div>
  );
}
