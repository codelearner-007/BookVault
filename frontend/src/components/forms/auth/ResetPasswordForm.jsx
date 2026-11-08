'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@/lib/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form } from '@/components/ui/form';
import { PasswordFormField } from '@/components/auth/common/PasswordFormField';
import { PasswordRules } from '@/components/auth/common/PasswordRules';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.reset;

export function ResetPasswordForm({ onSubmit, loading }) {
  const form = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });
  const [password, confirmPassword] = useWatch({ control: form.control, name: ['password', 'confirmPassword'] });

  const handleSubmit = async (values) => {
    const result = await onSubmit(values);
    if (!result.success) form.setError('root', { message: result.error || AUTH_UI_COPY.common.unexpected });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5" noValidate>
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <PasswordFormField control={form.control} name="password" label={COPY.newPassword} />
        <PasswordFormField control={form.control} name="confirmPassword" label={COPY.confirmPassword} />
        <PasswordRules password={password} confirm={confirmPassword} />
        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? COPY.submitting : COPY.submit}
        </Button>
      </form>
    </Form>
  );
}
