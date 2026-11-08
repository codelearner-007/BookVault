'use client';

import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { FormatProvider } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { Monogram } from '@/components/shell/BusinessSwitcher';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';
import { relativeTime } from '@/lib/utils/relative-time';
import { businessHref } from './workspace-links';

const EDIT_QUERY = 'tab=settings&page=business-details';
const SKELETON_ROWS = 4;
const FIGURE_KEYS = ['cash_and_bank', 'receivables', 'payables', 'net_profit'];

function businessMeta(business) {
  return [business.country ?? COPY.noCountry, business.currency_code].filter(Boolean).join(' · ');
}

function NameCell({ business }) {
  return (
    <span className="flex items-center gap-3">
      <Monogram name={business.name} className="size-mono-sm shrink-0 rounded-mono text-sm" />
      <span className="min-w-0">
        <span className="block truncate">{business.name}</span>
        <span className="block truncate text-sm font-normal text-muted-foreground">{businessMeta(business)}</span>
      </span>
    </span>
  );
}

// Each figure is formatted in its own business's number format; null = no right to view it.
function figureColumn(key) {
  return {
    key,
    label: COPY.figures[key],
    kind: COLUMN_KIND.money,
    card: 'meta',
    render: (business) => (
      business.figures[key] === null
        ? <span className="text-muted-foreground">-</span>
        : <FormatProvider format={business}><Money value={business.figures[key]} zero="muted" tone="auto" /></FormatProvider>
    ),
  };
}

const COLUMNS = [
  { key: 'name', label: COPY.columns.business, card: 'title', render: (business) => <NameCell business={business} /> },
  {
    key: 'role',
    label: COPY.columns.role,
    card: 'meta',
    render: (business) => <Badge variant="role">{business.is_owner ? COPY.owner : COPY.member}</Badge>,
  },
  ...FIGURE_KEYS.map(figureColumn),
  {
    key: 'members',
    label: COPY.columns.members,
    kind: COLUMN_KIND.qty,
    card: 'meta',
    render: (business) => (business.member_count === null ? '' : business.member_count),
  },
  {
    key: 'last_activity_at',
    label: COPY.columns.lastActivity,
    muted: true,
    card: 'meta',
    render: (business) => (business.last_activity_at ? relativeTime(business.last_activity_at) : COPY.noRecentActivity),
  },
];

export function BusinessList({ businesses, menu }) {
  const router = useRouter();
  return (
    <ListTable
      columns={COLUMNS}
      rows={businesses}
      rowName={(business) => business.name}
      onView={(business) => router.push(businessHref(business.id))}
      onEdit={(business) => router.push(businessHref(business.id, EDIT_QUERY))}
      canEdit={(business) => business.is_owner}
      menu={menu}
    />
  );
}

export function BusinessListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-mono-sm shrink-0 rounded-mono" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ms-auto h-4 w-24" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
