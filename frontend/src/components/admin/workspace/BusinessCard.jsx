'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Monogram } from '@/components/shell/BusinessSwitcher';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';
import { cn } from '@/lib/utils';
import { businessMoneyFormatter } from '@/lib/utils/money';
import { relativeTime } from '@/lib/utils/relative-time';
import { businessHref } from './workspace-links';

// The headline figures, in reading order; each shows only when the user may view its area.
const FIGURE_KEYS = ['cash_and_bank', 'receivables', 'payables', 'net_profit'];
const SKELETON_FIGURES = FIGURE_KEYS.length;

function businessMeta(business) {
  return [business.country ?? COPY.noCountry, business.currency_code].filter(Boolean).join(' · ');
}

function Figures({ business }) {
  const format = businessMoneyFormatter(business);
  const shown = FIGURE_KEYS.filter((key) => business.figures[key] !== null);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">{COPY.noFigures}</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 @lg:grid-cols-4">
      {shown.map((key) => {
        const value = business.figures[key];
        return (
          <div key={key} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{COPY.figures[key]}</dt>
            <dd className={cn('num mt-1 truncate text-start text-md font-semibold', Number(value) === 0 && 'text-muted-foreground')}>
              {format(value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function CardFootnote({ business }) {
  const activity = business.last_activity_at ? COPY.lastActivity(relativeTime(business.last_activity_at)) : COPY.noRecentActivity;
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-row-divider px-card py-3.5 text-sm text-muted-foreground">
      <span className="truncate">{activity}</span>
      {business.member_count !== null && <span className="shrink-0">{COPY.people(business.member_count)}</span>}
    </div>
  );
}

// One business: identity, role, up to four ledger figures in its own currency; the whole card opens it.
export function BusinessCard({ business, showFootnote = false }) {
  return (
    <Link
      href={businessHref(business.id)}
      className="group block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="@container flex h-full flex-col transition-[background-color,box-shadow] duration-150 ease-out group-hover:bg-secondary-hover">
        <div className="flex items-start gap-3 p-card pb-5">
          <Monogram name={business.name} className="size-mono rounded-mono text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-md font-semibold tracking-tight">{business.name}</p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{businessMeta(business)}</p>
          </div>
          <Badge variant="role">{business.is_owner ? COPY.owner : COPY.member}</Badge>
        </div>
        <div className="px-card pb-card">
          <Figures business={business} />
        </div>
        {showFootnote && <CardFootnote business={business} />}
      </Card>
    </Link>
  );
}

export function BusinessCardSkeleton({ showFootnote = false }) {
  return (
    <Card className="flex flex-col" aria-hidden="true">
      <div className="flex items-start gap-3 p-card pb-5">
        <Skeleton className="size-mono shrink-0 rounded-mono" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-pill w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-card pb-card">
        {Array.from({ length: SKELETON_FIGURES }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
      {showFootnote && (
        <div className="flex justify-between border-t border-row-divider px-card py-3.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      )}
    </Card>
  );
}
