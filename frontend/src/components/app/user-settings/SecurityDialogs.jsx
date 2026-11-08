'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { authService } from '@/lib/services/auth.service';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChangePasswordForm } from '@/components/forms/user/ChangePasswordForm';
import { PasswordInput } from '@/components/auth/common/PasswordInput';
import { MfaEnrollment } from '@/components/auth/mfa/MfaEnrollment';
import { RecoveryCodesPanel } from '@/components/auth/mfa/RecoveryCodesPanel';
import { TOTP_LENGTH, TotpCodeField } from '@/components/auth/mfa/TotpCodeField';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.security;
const DISABLE_PASSWORD_ID = 'disable-2fa-password';

export function ChangePasswordDialog({ open, onOpenChange }) {
  const change = async (values) => {
    try {
      const response = await authService.changePassword(values);
      toast.success(response.message);
      onOpenChange(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.changePassword}</DialogTitle>
          <DialogDescription>{COPY.passwordText}</DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onSubmit={change} fullWidth />
      </DialogContent>
    </Dialog>
  );
}

export function EnrolDialog({ open, onOpenChange, onEnrolled }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{AUTH_UI_COPY.enrol.title}</DialogTitle>
        </DialogHeader>
        {open && <MfaEnrollment onDone={onEnrolled} />}
      </DialogContent>
    </Dialog>
  );
}

// Shown once after "Generate new codes"; closing it is the confirmation they were saved.
export function RecoveryCodesDialog({ codes, onClose }) {
  return (
    <Dialog open={codes.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{COPY.recoveryTitle}</DialogTitle>
        </DialogHeader>
        <RecoveryCodesPanel codes={codes} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

// Password + a current code (the code is verified first, which also refreshes AAL2).
export function DisableMfaDialog({ factor, open, onOpenChange, onDisabled }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (code.length !== TOTP_LENGTH) return setError(AUTH_UI_COPY.mfa.codeLength);
    setPending(true);
    setError('');
    try {
      await authService.verifyTotpCode(factor.id, code);
      const response = await authService.unenrollMFAFactor(factor.id, password);
      toast.success(response.message);
      onDisabled();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.disableTitle}</DialogTitle>
          <DialogDescription>{COPY.disableText}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <div className="grid gap-2">
            <Label htmlFor={DISABLE_PASSWORD_ID}>{AUTH_UI_COPY.common.password}</Label>
            <PasswordInput id={DISABLE_PASSWORD_ID} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <TotpCodeField id="disable-2fa-code" value={code} onChange={setCode} error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{AUTH_UI_COPY.common.cancel}</Button>
            <Button type="submit" variant="destructive" disabled={pending || !password}>
              {pending ? COPY.disabling : COPY.disableSubmit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// A confirmation before an action that cannot be undone from here.
export function ConfirmDialog({ open, onOpenChange, title, text, actionLabel, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{AUTH_UI_COPY.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
