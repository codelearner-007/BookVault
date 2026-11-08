'use client';

import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUser } from '@/lib/hooks/useUser';
import { ChangePasswordForm } from '@/components/forms/user/ChangePasswordForm';
import {
  CheckCircle,
  AlertCircle,
  ShieldCheck,
  Lock,
  RefreshCw,
} from 'lucide-react';

const securityTips = [
  {
    icon: Lock,
    text: 'Use at least 12 characters; a passphrase of a few words works well',
  },
  {
    icon: RefreshCw,
    text: 'Change your password regularly and avoid reusing old passwords',
  },
  {
    icon: ShieldCheck,
    text: 'Enable two-factor authentication for additional account protection',
  },
];

export function PasswordSection() {
  const { changePassword, loading, error } = useUser();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (data) => {
    setSuccess(false);
    const result = await changePassword(data);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    }

    return result;
  };

  return (
    <div className="space-y-6">
      {success && (
        <Alert className="bg-ok-soft text-ok [&>svg]:text-ok">
          <CheckCircle />
          <AlertDescription>
            Password changed successfully! Other sessions have been signed out.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Password change card */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-prose">
            <ChangePasswordForm onSubmit={handleSubmit} loading={loading} />
          </div>
        </CardContent>
      </Card>

      {/* Security tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            Password Best Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {securityTips.map((tip, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-control bg-muted p-3">
                <tip.icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground leading-snug">
                  {tip.text}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
