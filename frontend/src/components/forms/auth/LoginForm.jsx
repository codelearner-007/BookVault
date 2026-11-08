'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@/lib/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordInput } from '@/components/auth/common/PasswordInput';
import { AuthLink } from '@/components/auth/common/AuthCard';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.login;
const COMMON = AUTH_UI_COPY.common;

export function LoginForm({ onSubmit, loading }) {
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

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
                <Input type="email" autoComplete="username" placeholder={COMMON.emailPlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-baseline justify-between gap-2">
                <FormLabel>{COMMON.password}</FormLabel>
                <AuthLink href={AUTH_ROUTES.forgot} className="text-sm">{COPY.forgot}</AuthLink>
              </div>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
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
