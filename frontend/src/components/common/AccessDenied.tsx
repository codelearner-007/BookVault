/**
 * AccessDenied Component
 *
 * Shown when user tries to access a page they don't have permissions for
 */

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AccessDeniedProps {
  message?: string;
  returnTo?: string;
  returnLabel?: string;
}

export default function AccessDenied({
  message = 'You do not have permission to access this page.',
  returnTo = '/app',
  returnLabel = 'Go to Homepage',
}: AccessDeniedProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-6">
            <ShieldAlert className="h-16 w-16 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">{message}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href={returnTo}>{returnLabel}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/user-settings">View My Permissions</Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          If you believe you should have access, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
