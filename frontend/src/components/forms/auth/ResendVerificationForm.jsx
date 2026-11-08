'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.verify;
const COMMON = AUTH_UI_COPY.common;
// Seconds before another link can be requested (the server rate-limits too).
export const RESEND_COOLDOWN_SECONDS = 60;
const TICK_MS = 1000;

function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((s) => s - 1), TICK_MS);
    return () => clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds];
}

// Email + "Send a new link", then a visible cooldown before the next request.
export function ResendVerificationForm({ defaultEmail = '', onSubmit, variant = 'secondary' }) {
  const [cooldown, setCooldown] = useCountdown();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: defaultEmail } });

  useEffect(() => {
    if (defaultEmail) form.setValue('email', defaultEmail);
  }, [defaultEmail, form]);

  const handleSubmit = async ({ email }) => {
    setSending(true);
    setMessage('');
    try {
      const response = await onSubmit(email);
      setMessage(response.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      form.setError('root', { message: err.message || COMMON.unexpected });
    } finally {
      setSending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{COMMON.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder={COMMON.emailPlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant={variant} className="w-full" disabled={sending || cooldown > 0}>
          {sending ? COPY.resending : COPY.resend}
        </Button>
        <div aria-live="polite" className="grid gap-1 text-center text-sm text-muted-foreground">
          {form.formState.errors.root && <p className="text-bad">{form.formState.errors.root.message}</p>}
          {message && <p>{message}</p>}
          {cooldown > 0 && <p>{COPY.cooldown(cooldown)}</p>}
        </div>
      </form>
    </Form>
  );
}
