'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, ShieldCheck, Calendar, Building2, ArrowRight, ClipboardList, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobal } from '@/lib/context/GlobalContext';
import { getDashboardStats } from '@/lib/services/dashboard.service';

const ADMIN_LAST_PATH_KEY = 'admin_last_path';

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

const STAT_CARDS = [
  { key: 'total_businesses', title: 'My Businesses', icon: Building2 },
  { key: 'total_audit_logs', title: 'My Actions', icon: ClipboardList },
  { key: 'recent_activity_24h', title: 'Actions (24h)', icon: Activity },
];

function StatCards() {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {STAT_CARDS.map(({ key, title, icon }) => (
        <InfoCard key={key} icon={icon} title={title}>
          {stats ? (
            <p className="text-2xl font-semibold text-foreground">{stats[key]}</p>
          ) : (
            <Skeleton className="h-8 w-12" />
          )}
        </InfoCard>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading } = useGlobal();

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_LAST_PATH_KEY);
    if (stored && stored !== '/admin') {
      router.replace(stored);
    }
  }, [router]);

  const status = getStatusBadge(user);
  const roleName = user?.app_metadata?.user_role || 'user';
  const createdAt = user?.registered_at;
  const email = user?.email;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        {loading ? (
          <Skeleton className="h-4 w-56 mt-1" />
        ) : (
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back,{' '}
            <span className="font-medium text-foreground">{email || 'Admin'}</span>
          </p>
        )}
      </div>

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-3">
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

      <StatCards />

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/businesses" className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
            <Card className="border-border shadow-sm group-hover:border-primary/30 group-hover:bg-muted/40 transition-all duration-200 cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors duration-200">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-medium text-foreground">Businesses</CardTitle>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Create and manage your businesses, configure settings and chart of accounts.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
