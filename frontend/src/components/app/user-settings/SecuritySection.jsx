'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authService } from '@/lib/services/auth.service';
import { useAuth } from '@/lib/hooks/useAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MoreMenu } from '@/components/common/page';
import {
  ChangePasswordDialog, ConfirmDialog, DisableMfaDialog, EnrolDialog, RecoveryCodesDialog,
} from './SecurityDialogs';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES, withReturnTo } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.security;
const REAUTH_REQUIRED = 'reauth_required';
const ROWS = 4;
// Which dialog is open; one at a time.
const DIALOG = { password: 'password', enrol: 'enrol', disable: 'disable', regenerate: 'regenerate', revoke: 'revoke' };

function SecurityRow({ title, status, text, children }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-row-divider px-card py-5 last:border-b-0">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{title}</p>
          {status}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  );
}

export function SecuritySkeleton() {
  return (
    <Card className="max-w-prose" aria-busy="true">
      {Array.from({ length: ROWS }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-6 border-b border-row-divider px-card py-5 last:border-b-0">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-sm" />
          </div>
          <Skeleton className="h-control-sm w-32 rounded-full" />
        </div>
      ))}
    </Card>
  );
}

async function loadSecurity() {
  const factor = await authService.getVerifiedTotpFactor();
  const codes = factor ? await authService.getRecoveryCodeStatus().catch(() => null) : null;
  return { factor, remaining: codes?.remaining ?? null };
}

// Account -> Security: password, two-factor sign-in, recovery codes and sessions (B0.7).
export function SecuritySection() {
  const { logout } = useAuth();
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [codes, setCodes] = useState([]);
  const [reauth, setReauth] = useState('');

  const reload = useCallback(() => {
    loadSecurity().then(setState).catch(() => setFailed(true));
  }, []);
  useEffect(reload, [reload]);

  const closeDialog = (open) => !open && setDialog(null);
  const afterChange = () => {
    setDialog(null);
    reload();
  };

  const regenerate = async () => {
    try {
      setCodes((await authService.generateRecoveryCodes()).codes);
      reload();
    } catch (err) {
      if (err.code === REAUTH_REQUIRED) setReauth(err.message);
      else toast.error(err.message);
    }
  };

  const revokeOthers = async () => {
    try {
      toast.success((await authService.revokeOtherSessions()).message);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const signInAgain = () => logout(withReturnTo(AUTH_ROUTES.login, window.location.pathname + window.location.search));

  if (failed) return <Alert variant="destructive" className="max-w-prose"><AlertDescription>{COPY.loadFailed}</AlertDescription></Alert>;
  if (!state) return <SecuritySkeleton />;

  const { factor, remaining } = state;
  return (
    <div className="grid max-w-prose gap-4">
      {reauth && (
        <Alert variant="warn">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{reauth}</span>
            <Button variant="secondary" size="sm" onClick={() => void signInAgain()}>{COPY.reauthAction}</Button>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <ul>
          <SecurityRow title={COPY.passwordTitle} text={COPY.passwordText}>
            <Button variant="secondary" size="sm" onClick={() => setDialog(DIALOG.password)}>{COPY.changePassword}</Button>
          </SecurityRow>
          <SecurityRow
            title={COPY.mfaTitle}
            status={<Badge variant={factor ? 'ok' : 'neutral'}>{factor ? COPY.statusOn : COPY.statusOff}</Badge>}
            text={factor ? COPY.mfaOnText : COPY.mfaOffText}
          >
            {factor ? (
              <MoreMenu items={[{ label: COPY.turnOff, destructive: true, onSelect: () => setDialog(DIALOG.disable) }]} />
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setDialog(DIALOG.enrol)}>{COPY.turnOn}</Button>
            )}
          </SecurityRow>
          {factor && (
            <SecurityRow title={COPY.recoveryTitle} text={remaining === null ? COPY.recoveryUnknown : COPY.recoveryText(remaining)}>
              <Button variant="secondary" size="sm" onClick={() => setDialog(DIALOG.regenerate)}>{COPY.regenerate}</Button>
            </SecurityRow>
          )}
          <SecurityRow title={COPY.sessionsTitle} text={COPY.sessionsText}>
            <Button variant="secondary" size="sm" onClick={() => setDialog(DIALOG.revoke)}>{COPY.revoke}</Button>
          </SecurityRow>
        </ul>
      </Card>

      <ChangePasswordDialog open={dialog === DIALOG.password} onOpenChange={closeDialog} />
      <EnrolDialog open={dialog === DIALOG.enrol} onOpenChange={closeDialog} onEnrolled={afterChange} />
      {factor && <DisableMfaDialog factor={factor} open={dialog === DIALOG.disable} onOpenChange={closeDialog} onDisabled={afterChange} />}
      <ConfirmDialog
        open={dialog === DIALOG.regenerate}
        onOpenChange={closeDialog}
        title={COPY.regenerateTitle}
        text={COPY.regenerateText}
        actionLabel={COPY.regenerate}
        onConfirm={() => void regenerate()}
      />
      <ConfirmDialog
        open={dialog === DIALOG.revoke}
        onOpenChange={closeDialog}
        title={COPY.revokeTitle}
        text={COPY.revokeText}
        actionLabel={COPY.revoke}
        onConfirm={() => void revokeOthers()}
      />
      <RecoveryCodesDialog codes={codes} onClose={() => setCodes([])} />
    </div>
  );
}
