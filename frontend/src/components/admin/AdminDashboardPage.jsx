'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page';
import { useGlobal } from '@/lib/context/GlobalContext';

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

function getStatusBadge(user) {
  if (!user) return { label: 'Unknown', variant: 'neutral' };

  const isBanned = user.app_metadata?.banned ?? false;
  const isVerified =
    user.email_confirmed_at || user.confirmed_at || user.app_metadata?.email_verified;

  if (isBanned) return { label: 'Banned', variant: 'bad' };
  if (!isVerified) return { label: 'Unverified', variant: 'neutral' };
  return { label: 'Active', variant: 'ok' };
}

function AccountItem({ label, loading, skeletonClassName, children }) {
  return (
    <div className="flex min-h-row items-center justify-between gap-4 border-b border-row-divider last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">
        {loading ? <Skeleton className={skeletonClassName} /> : children}
      </dd>
    </div>
  );
}

function AccountCard({ user, loading }) {
  const status = getStatusBadge(user);
  const roleName = user?.app_metadata?.user_role || 'user';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <AccountItem label="Status" loading={loading} skeletonClassName="h-pill w-20 rounded-full">
            <Badge variant={status.variant}>{status.label}</Badge>
          </AccountItem>
          <AccountItem label="Role" loading={loading} skeletonClassName="h-5 w-16">
            <span className="capitalize">{roleName.replace(/_/g, ' ')}</span>
          </AccountItem>
          <AccountItem label="Member since" loading={loading} skeletonClassName="h-5 w-32">
            {formatDate(user?.registered_at)}
          </AccountItem>
        </dl>
      </CardContent>
    </Card>
  );
}

function BusinessesLink() {
  return (
    <Link href="/admin/businesses" className="group block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Card className="transition-colors duration-150 group-hover:bg-row-hover">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="grid gap-1">
            <CardTitle>Businesses</CardTitle>
            <CardDescription>Create and manage your businesses, configure settings and chart of accounts.</CardDescription>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
        </CardHeader>
      </Card>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { user, loading } = useGlobal();

  // A span, not <Skeleton> (a div): PageHeader renders the description inside a <p>.
  const description = loading ? (
    <span className="inline-block h-4 w-56 animate-pulse rounded-control bg-accent align-middle" aria-hidden="true" />
  ) : (
    <>Welcome back, <span className="font-medium text-foreground">{user?.email || 'Admin'}</span></>
  );

  return (
    <div>
      <PageHeader title="Dashboard" description={description} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard user={user} loading={loading} />
        <div>
          <BusinessesLink />
        </div>
      </div>
    </div>
  );
}
