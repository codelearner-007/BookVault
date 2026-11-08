'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@/lib/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form } from '@/components/ui/form';
import { PasswordFormField } from '@/components/auth/common/PasswordFormField';
import { PasswordRules } from '@/components/auth/common/PasswordRules';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.security;

/*
  Change password with re-authentication (the current password, checked by the route).
  onSubmit resolves { success, error }; a success resets the form.
*/
export function ChangePasswordForm({ onSubmit, currentLabel = COPY.currentPassword, submitLabel = COPY.savePassword, fullWidth }) {
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const [newPassword, confirmPassword] = useWatch({ control: form.control, name: ['newPassword', 'confirmPassword'] });

  const handleSubmit = async (values) => {
    const result = await onSubmit(values);
    if (result.success) form.reset();
    else form.setError('root', { message: result.error || AUTH_UI_COPY.common.unexpected });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5" noValidate>
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <PasswordFormField control={form.control} name="currentPassword" label={currentLabel} autoComplete="current-password" />
        <PasswordFormField control={form.control} name="newPassword" label={COPY.newPassword} />
        <PasswordFormField control={form.control} name="confirmPassword" label={COPY.confirmPassword} />
        <PasswordRules password={newPassword} confirm={confirmPassword} />
        <Button type="submit" className={fullWidth ? 'mt-2 w-full' : 'mt-2 justify-self-start'} disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? COPY.saving : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
