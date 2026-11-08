'use client';

import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { AuthCard } from '@/components/auth/common/AuthCard';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.banned;

// A suspended or disabled account: say what happened and what to do; the only action is to log out.
export function BannedPage() {
  const { logout, loading } = useAuth();
  return (
    <AuthCard icon={ShieldOff} title={COPY.title} lede={COPY.lede}>
      <p className="mb-6 text-center text-sm text-muted-foreground text-pretty">{COPY.next}</p>
      <Button className="w-full" onClick={() => void logout()} disabled={loading}>
        {AUTH_UI_COPY.common.logOut}
      </Button>
    </AuthCard>
  );
}
