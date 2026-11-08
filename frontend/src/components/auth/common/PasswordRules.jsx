import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/schemas/password.schema';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.passwordRules;

// The password policy (D-26: length only) checked live as the user types.
export function PasswordRules({ password = '', confirm }) {
  const rules = [
    { label: COPY.minLength(PASSWORD_MIN_LENGTH), met: password.length >= PASSWORD_MIN_LENGTH },
    { label: COPY.maxLength(PASSWORD_MAX_LENGTH), met: password.length > 0 && password.length <= PASSWORD_MAX_LENGTH },
  ];
  if (confirm !== undefined) rules.push({ label: COPY.matches, met: password.length > 0 && password === confirm });

  return (
    <div className="text-xs text-muted-foreground">
      <ul aria-label={COPY.label} className="grid gap-1">
        {rules.map((rule) => (
          <li key={rule.label} className={cn('flex items-center gap-2', rule.met && 'text-ok')}>
            {rule.met ? (
              <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <Circle className="size-3.5" aria-hidden="true" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5">{COPY.hint}</p>
    </div>
  );
}
