'use client';

import { useId } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ListCard } from '@/components/common/page';
import { ACTIVITY_ENTITIES, ACTIVITY_VERBS, WORKSPACE_COPY as COPY, activityActor } from '@/lib/copy/workspace';
import { FormatProvider } from '@/components/common/business-format';
import { useMoneyFormatter } from '@/components/common/money';
import { relativeTime } from '@/lib/utils/relative-time';
import { ATTENTION_KINDS, activityHref, businessHref } from './workspace-links';

const ROW_LINK =
  'flex min-h-row items-center gap-3 rounded-control px-4 py-3 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-ring';
const ACTIVITY_SKELETON_ROWS = 5;

export function Section({ title, action, children, className }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 flex min-h-control items-center justify-between gap-3">
        <h2 id={id} className="text-md font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function activityTitle(event) {
  const entity = ACTIVITY_ENTITIES[event.entity_type] ?? event.entity_type;
  return event.record_label ? `${entity} ${event.record_label}` : entity;
}

function activityDetail(event) {
  const verb = ACTIVITY_VERBS[event.action] ?? event.action;
  return `${verb} by ${activityActor(event)} · ${event.business_name}`;
}

export function ActivityList({ events }) {
  if (events.length === 0) {
    return (
      <ListCard>
        <p className="px-4 py-6 text-sm text-muted-foreground">{COPY.noActivity}</p>
      </ListCard>
    );
  }
  return (
    <ListCard>
      <ul className="divide-y divide-row-divider">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={activityHref(event)} className={ROW_LINK}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{activityTitle(event)}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{activityDetail(event)}</p>
              </div>
              <time dateTime={event.created_at} className="shrink-0 text-sm text-muted-foreground">
                {relativeTime(event.created_at)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </ListCard>
  );
}

export function ActivitySkeleton() {
  return (
    <ListCard>
      <div className="divide-y divide-row-divider" aria-hidden="true">
        {Array.from({ length: ACTIVITY_SKELETON_ROWS }, (_, i) => (
          <div key={i} className="flex min-h-row items-center gap-3 px-4 py-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </ListCard>
  );
}

// Suspense is told as the amount to allocate (its ledger sign is credit-positive, so never shown signed).
function AttentionDetail({ kind, business, amount, count }) {
  const format = useMoneyFormatter();
  const money = `${business.currency_code ?? ''} ${format(amount, { absolute: kind !== ATTENTION_KINDS.overdue })}`.trim();
  return kind === ATTENTION_KINDS.overdue ? COPY.overdueDetail(count, money) : COPY.suspenseDetail(money);
}

// Suspense balances that are not zero (money posted without a final account) and overdue sales invoices.
export function AttentionList({ items }) {
  return (
    <ListCard>
      <ul className="divide-y divide-row-divider">
        {items.map((item) => (
          <li key={`${item.business.id}-${item.kind}`}>
            <Link href={businessHref(item.business.id, item.query)} className={ROW_LINK}>
              <Badge variant="warn">{item.kind === ATTENTION_KINDS.overdue ? COPY.overduePill : COPY.suspensePill}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.business.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <FormatProvider format={item.business}><AttentionDetail {...item} /></FormatProvider>
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </ListCard>
  );
}
