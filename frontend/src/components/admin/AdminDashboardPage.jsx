'use client';

import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { useShell } from '@/components/shell/ShellContext';
import { BusinessCard, BusinessCardSkeleton } from '@/components/admin/workspace/BusinessCard';
import {
  ActivityList, ActivitySkeleton, AttentionList, Section,
} from '@/components/admin/workspace/WorkspaceSections';
import { attentionItems, businessHref } from '@/components/admin/workspace/workspace-links';
import { useClientMinute, useWorkspaceDashboard } from '@/components/admin/workspace/use-workspace-dashboard';
import { useGlobal } from '@/lib/context/GlobalContext';
import { WORKSPACE_COPY as COPY, greeting } from '@/lib/copy/workspace';
import { PAGE_SIZE_MAX } from '@/lib/config';
import { useLastBusinessId } from '@/lib/navigation/last-business';

const CARDS_SHOWN = 6;
const SKELETON_CARDS = 2;
const CREATE_HREF = '/admin/businesses?create=1';
const BUSINESSES_HREF = '/admin/businesses';
const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const CARD_GRID = 'grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2';

function firstName(user) {
  return user?.user_metadata?.full_name?.trim().split(/\s+/)[0] ?? null;
}

function Greeting({ user }) {
  const now = useClientMinute();
  // A span, not <Skeleton> (a div): PageHeader renders the title inside an <h1>.
  if (!now) {
    return (
      <PageHeader
        title={<span className="inline-block h-9 w-72 animate-pulse rounded-control bg-accent align-middle" aria-hidden="true" />}
        className="mb-0 max-md:mb-0"
      />
    );
  }
  return (
    <PageHeader
      title={greeting(now.getHours(), firstName(user))}
      description={new Intl.DateTimeFormat(undefined, DATE_FORMAT).format(now)}
      className="mb-0 max-md:mb-0"
    />
  );
}

function QuickActions({ businesses, canCreate }) {
  const lastId = useLastBusinessId();
  const last = businesses.find((b) => b.id === lastId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {last && (
        <Button variant="secondary" asChild>
          <Link href={businessHref(last.id)}>{COPY.openBusiness(last.name)}</Link>
        </Button>
      )}
      {canCreate && (
        <Button asChild>
          <Link href={CREATE_HREF}><Plus aria-hidden="true" />{COPY.createBusiness}</Link>
        </Button>
      )}
    </div>
  );
}

function FirstBusiness({ canCreate }) {
  return (
    <ListCard>
      <EmptyState
        icon={Building2}
        title={canCreate ? COPY.emptyOwnerTitle : COPY.emptyMemberTitle}
        description={canCreate ? COPY.emptyOwnerDescription : COPY.emptyMemberDescription}
        action={canCreate && (
          <Button asChild className="mt-2">
            <Link href={CREATE_HREF}><Plus aria-hidden="true" />{COPY.createBusiness}</Link>
          </Button>
        )}
      />
    </ListCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-3" aria-busy="true">
      <div className="space-y-3 lg:col-span-2">
        <Skeleton className="h-6 w-40" />
        <div className={CARD_GRID}>
          {Array.from({ length: SKELETON_CARDS }, (_, i) => <BusinessCardSkeleton key={i} />)}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-36" />
        <ActivitySkeleton />
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>{COPY.retry}</Button>
    </div>
  );
}

function DashboardBody({ data }) {
  const businesses = data.items;
  const attention = attentionItems(businesses);
  const more = data.total > CARDS_SHOWN && (
    <Button variant="ghost" size="sm" asChild>
      <Link href={BUSINESSES_HREF}>{COPY.allBusinesses(data.total)}</Link>
    </Button>
  );
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {attention.length > 0 && (
          <Section title={COPY.needsAttention}>
            <AttentionList items={attention} />
          </Section>
        )}
        <Section title={COPY.yourBusinesses} action={more}>
          <div className={businesses.length > 1 ? CARD_GRID : 'grid'}>
            {businesses.slice(0, CARDS_SHOWN).map((b) => <BusinessCard key={b.id} business={b} />)}
          </div>
        </Section>
      </div>
      <Section title={COPY.recentActivity}>
        <ActivityList events={data.activity} />
      </Section>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useGlobal();
  const { canCreateBusiness } = useShell();
  const { data, error, loading, reload } = useWorkspaceDashboard({ page: 1, pageSize: PAGE_SIZE_MAX });
  const empty = data && data.total === 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-4 max-md:mb-6">
        <Greeting user={user} />
        {data && !empty && <QuickActions businesses={data.items} canCreate={canCreateBusiness} />}
      </div>
      {error && <div className="mb-6"><LoadError message={error} onRetry={reload} /></div>}
      {!data && loading && <DashboardSkeleton />}
      {empty && <FirstBusiness canCreate={canCreateBusiness} />}
      {data && !empty && <DashboardBody data={data} />}
    </div>
  );
}
