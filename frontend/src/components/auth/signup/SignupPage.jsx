'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { RegisterForm } from '@/components/forms/auth/RegisterForm';
import Link from 'next/link';
import SSOButtons from '@/components/auth/SSOButtons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function SignupPage() {
  const { register, loading, error } = useAuth();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState('');

  const handleRegister = async (data) => {
    setTermsError('');

    if (!acceptedTerms) {
      setTermsError('You must accept the Terms of Service and Privacy Policy');
      return { success: false, error: 'You must accept the Terms of Service and Privacy Policy' };
    }

    return register(data);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Get started with your free account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(error || termsError) && (
          <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
            {error || termsError}
          </div>
        )}

        <RegisterForm onSubmit={handleRegister} loading={loading} />

        <div className="flex items-start space-x-3">
          <Checkbox
            id="terms"
            checked={acceptedTerms}
            onCheckedChange={(checked) => setAcceptedTerms(!!checked)}
          />
          <Label htmlFor="terms" className="text-sm text-muted-foreground leading-none font-normal cursor-pointer">
            I agree to the{' '}
            <Link href="/terms" className="font-medium text-primary hover:text-primary/80 transition-colors" target="_blank">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-primary hover:text-primary/80 transition-colors" target="_blank">
              Privacy Policy
            </Link>
          </Label>
        </div>

        <SSOButtons onError={() => {}} />

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
