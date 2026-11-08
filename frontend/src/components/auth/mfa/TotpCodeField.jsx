'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

export const TOTP_LENGTH = 6;
const NON_DIGITS = /\D/g;

// The 6-digit authenticator code: numeric keypad on phones, one-time-code autofill.
export function TotpCodeField({ id = 'totp-code', value, onChange, label = AUTH_UI_COPY.mfa.code, error, autoFocus }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(NON_DIGITS, '').slice(0, TOTP_LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TOTP_LENGTH}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="text-center text-lg font-semibold tracking-widest tabular-nums"
      />
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}
