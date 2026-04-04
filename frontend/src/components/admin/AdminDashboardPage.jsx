'use client';

import { useEffect, useState } from 'react';
import { User, ShieldCheck, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { authService } from '@/lib/services/auth.service';

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

function getStatusBadge(user) {
  if (!user) return { label: 'Unknown', variant: 'secondary' };

  const isBanned = user.app_metadata?.banned ?? false;
  const isVerified =
    user.email_confirmed_at || user.confirmed_at || user.app_metadata?.email_verified;

  if (isBanned) return { label: 'Banned', variant: 'destructive' };
  if (!isVerified) return { label: 'Unverified', variant: 'secondary' };
  return { label: 'Active', variant: 'default' };
}

function InfoCard({ icon: Icon, title, children }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadUser() {
      try {
        setLoading(true);
        const data = await authService.getCurrentUser();
        setUserData(data?.user ?? data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account info');
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const status = getStatusBadge(userData);
  const roleName = userData?.app_metadata?.user_role || 'user';
  const createdAt = userData?.created_at;
  const email = userData?.email;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        {loading ? (
          <Skeleton className="h-4 w-56 mt-1" />
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back,{' '}
            <span className="font-medium text-foreground">{email || 'Admin'}</span>
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Info cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        {/* Account Status */}
        <InfoCard icon={ShieldCheck} title="Account Status">
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <Badge
              variant={status.variant}
              className={
                status.label === 'Active'
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : undefined
              }
            >
              {status.label}
            </Badge>
          )}
        </InfoCard>

        {/* Role */}
        <InfoCard icon={User} title="Role">
          {loading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <p className="text-sm font-medium text-foreground capitalize">
              {roleName.replace(/_/g, ' ')}
            </p>
          )}
        </InfoCard>

        {/* Member Since */}
        <InfoCard icon={Calendar} title="Member Since">
          {loading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <p className="text-sm font-medium text-foreground">{formatDate(createdAt)}</p>
          )}
        </InfoCard>
      </div>
    </div>
  );
}
