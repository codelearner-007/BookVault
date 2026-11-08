'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@/lib/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.forgot;
const COMMON = AUTH_UI_COPY.common;

export function ForgotPasswordForm({ onSubmit, loading }) {
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const handleSubmit = async (values) => {
    const result = await onSubmit(values);
    if (!result.success) form.setError('root', { message: result.error || COMMON.unexpected });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5" noValidate>
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
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
        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? COPY.submitting : COPY.submit}
        </Button>
      </form>
    </Form>
  );
}
