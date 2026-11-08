'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PASSWORD_MIN_LENGTH } from '@/lib/schemas/password.schema';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';

// Form fields shared by Add user, Edit details and Reset password (react-hook-form + shadcn Form).

export function TextField({ control, name, label, type = 'text', autoComplete, disabled }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} autoComplete={autoComplete} disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function PasswordField({ control, name, label, disabled }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const met = field.value.length >= PASSWORD_MIN_LENGTH;
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="new-password" disabled={disabled} {...field} />
            </FormControl>
            <FormDescription className={cn('flex items-center gap-1.5', met && 'text-ok')}>
              <Check className={cn('size-3.5', !met && 'opacity-40')} aria-hidden="true" />
              {COPY.passwordRule(PASSWORD_MIN_LENGTH)}
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

export function MustChangeField({ control, disabled }) {
  return (
    <FormField
      control={control}
      name="must_change_password"
      render={({ field }) => (
        <FormItem className="flex items-start justify-between gap-4 space-y-0">
          <div className="grid gap-1">
            <FormLabel>{COPY.mustChange}</FormLabel>
            <FormDescription>{COPY.mustChangeHint}</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
