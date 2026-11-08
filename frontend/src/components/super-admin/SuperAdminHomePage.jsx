'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { getUserStats, listUsersWithRoles } from '@/lib/services/rbac.service';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';
import { PlatformRoleBadge, UserStatusBadge, formatDate, platformRole } from './platform-parts';

const COPY = SUPER_ADMIN_COPY.overview;
const COLUMNS = SUPER_ADMIN_COPY.users.columns;
const RECENT_COUNT = 8;

// One quiet card of account counts: figures, not KPI tiles.
function Figures({ stats }) {
  return (
    <Card className="mb-8 max-md:mb-6">
      <dl aria-label={COPY.figuresLabel} className="grid grid-cols-2 gap-x-6 gap-y-4 p-card sm:grid-cols-3 lg:grid-cols-5">
        {COPY.figures.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{stats?.[key] ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 space-y-2 max-md:mb-6">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-8 h-28 rounded-card max-md:mb-6" />
      <Skeleton className="mb-4 h-6 w-40" />
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {Array.from({ length: RECENT_COUNT }, (_, i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </div>
  );
}

function RecentTable({ users }) {
  return (
    <Table aria-label={COPY.recentTitle}>
      <TableHeader>
        <TableRow>
          <TableHead>{COLUMNS.user}</TableHead>
          <TableHead>{COLUMNS.role}</TableHead>
          <TableHead>{COLUMNS.status}</TableHead>
          <TableHead>{COLUMNS.created}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell data-card="title" className="break-all font-medium">{user.email}</TableCell>
            <TableCell data-card="meta"><PlatformRoleBadge name={platformRole(user)?.name} /></TableCell>
            <TableCell data-card="end"><UserStatusBadge user={user} /></TableCell>
            <TableCell data-card="meta" data-label={`${COLUMNS.created}:`} className="whitespace-nowrap text-muted-foreground">
              {formatDate(user.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SuperAdminHomePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.allSettled([getUserStats(), listUsersWithRoles({ page: 1, page_size: RECENT_COUNT })]).then(
      ([stats, recent]) => setData({
        stats: stats.status === 'fulfilled' ? stats.value : null,
        recent: recent.status === 'fulfilled' ? recent.value.items : null,
      })
    );
  }, []);

  if (!data) return <OverviewSkeleton />;

  return (
    <>
      <PageHeader title={COPY.title} description={COPY.description} />
      <Figures stats={data.stats} />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-md font-semibold">{COPY.recentTitle}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/super-admin/users">{COPY.allUsers}</Link>
        </Button>
      </div>
      <ListCard>
        {data.recent === null && <p className="p-4 text-sm text-bad" role="alert">{COPY.loadFailed}</p>}
        {data.recent?.length === 0 && <EmptyState icon={Users} title={SUPER_ADMIN_COPY.users.empty} />}
        {data.recent?.length > 0 && <RecentTable users={data.recent} />}
      </ListCard>
    </>
  );
}
