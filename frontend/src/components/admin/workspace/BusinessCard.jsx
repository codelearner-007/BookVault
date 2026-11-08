'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormatProvider } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { Monogram } from '@/components/shell/BusinessSwitcher';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';
import { relativeTime } from '@/lib/utils/relative-time';
import { businessHref } from './workspace-links';

// The headline figures, in reading order; each shows only when the user may view its area.
const FIGURE_KEYS = ['cash_and_bank', 'receivables', 'payables', 'net_profit'];
const SKELETON_FIGURES = FIGURE_KEYS.length;

function businessMeta(business) {
  return [business.country ?? COPY.noCountry, business.currency_code].filter(Boolean).join(' · ');
}

function Figures({ business }) {
  const shown = FIGURE_KEYS.filter((key) => business.figures[key] !== null);
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">{COPY.noFigures}</p>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 @lg:grid-cols-4">
      {shown.map((key) => {
        const value = business.figures[key];
        return (
          <div key={key} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{COPY.figures[key]}</dt>
            <dd className="mt-1 truncate text-md font-semibold">
              <Money value={value} zero="muted" tone="auto" />
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

// One business: identity, role, up to four ledger figures in its own number format; the whole card opens it
// (a stretched link).
export function BusinessCard({ business, showFootnote = false }) {
  return (
    <FormatProvider format={business}>
      <Card className="group relative @container flex h-full flex-col transition-[background-color,box-shadow] duration-150 ease-out has-[a:hover]:bg-secondary-hover">
        <div className="flex items-start gap-3 p-card pb-5">
          <Monogram name={business.name} className="size-mono rounded-mono text-sm" />
          <div className="min-w-0 flex-1">
            <Link
              href={businessHref(business.id)}
              className="block truncate text-md font-semibold tracking-tight after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
            >
              {business.name}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{businessMeta(business)}</p>
          </div>
          <div className="relative z-1">
            <Badge variant="role">{business.is_owner ? COPY.owner : COPY.member}</Badge>
          </div>
        </div>
        <div className="px-card pb-card">
          <Figures business={business} />
        </div>
        {showFootnote && <CardFootnote business={business} />}
      </Card>
    </FormatProvider>
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
