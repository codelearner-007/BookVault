'use client';

import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { authService } from '@/lib/services/auth.service';
import { ForgotPasswordForm } from '@/components/forms/auth/ForgotPasswordForm';
import { AuthCard, AuthLink } from '@/components/auth/common/AuthCard';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';
import { AUTH_ROUTES } from '@/lib/utils/auth-routes';

const COPY = AUTH_UI_COPY.forgot;

// One generic answer whether or not the email has an account (AC-37): the server's message.
export function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const backToLogin = <AuthLink href={AUTH_ROUTES.login}>{AUTH_UI_COPY.common.backToLogin}</AuthLink>;

  const send = async ({ email }) => {
    setLoading(true);
    try {
      const response = await authService.forgotPassword({ email });
      setSentMessage(response.message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthCard icon={MailCheck} title={COPY.sentTitle} lede={sentMessage} alt={backToLogin}>
        <p className="mb-5 text-center text-sm text-muted-foreground">{COPY.sentNote}</p>
        <Button variant="secondary" className="w-full" onClick={() => setSentMessage('')}>
          {COPY.again}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={COPY.title} lede={COPY.lede} alt={backToLogin}>
      <ForgotPasswordForm onSubmit={send} loading={loading} />
    </AuthCard>
  );
}
