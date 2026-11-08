'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { MFASetup } from '@/components/auth/mfa/MFASetup';
import { Shield, Smartphone, KeyRound, ScanLine } from 'lucide-react';

const howItWorks = [
  {
    icon: Smartphone,
    title: 'Install App',
    description:
      'Use Google Authenticator, Authy, or similar.',
  },
  {
    icon: ScanLine,
    title: 'Scan QR Code',
    description:
      'Link your account by scanning the code.',
  },
  {
    icon: KeyRound,
    title: 'Enter Code',
    description:
      'Enter the 6-digit verification code.',
  },
];

export function SecuritySection() {
  return (
    <div className="space-y-6">
      {/* 2FA setup card */}
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-prose">
          <MFASetup />
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" aria-hidden="true" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {howItWorks.map((step, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-control bg-muted p-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mono text-xs font-bold text-mono-foreground">
                    {i + 1}
                  </div>
                  <step.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
