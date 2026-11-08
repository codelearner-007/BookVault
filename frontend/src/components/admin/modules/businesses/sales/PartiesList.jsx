'use client';

import { Plus, Truck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { PARTY_STATUS } from './sales-documents';
import { StatusPill, useUrlSearch } from './sales-parts';

// Manager's columns after Name, per side: Customers add Uninvoiced and Available credit; Suppliers do not.
function partyColumns(side) {
  const name = {
    key: 'name',
    label: 'Name',
    card: 'title',
    render: (party) => <RecordTitle text={party.name}>{party.is_inactive && <InactiveBadge />}</RecordTitle>,
  };
  const balance = { key: 'balance', label: side.balance.label, kind: COLUMN_KIND.money, card: 'end', value: (party) => party[side.balance.field] };
  const status = { key: 'status', label: 'Status', render: (party) => <StatusPill statuses={PARTY_STATUS} status={party.status} /> };
  if (side.key === 'purchases') return [name, balance, status];
  return [
    name,
    { key: 'uninvoiced', label: 'Uninvoiced', kind: COLUMN_KIND.money, zero: 'muted' },
    balance,
    status,
    { key: 'available_credit', label: 'Available credit', kind: COLUMN_KIND.money },
  ];
}
const ICONS = { sales: Users, purchases: Truck };

// ?tab=customers|suppliers[&q=search][&p=N]: Manager's columns, the receivable / payable total from the server.
export default function PartiesList({ businessId, side, page, search, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(side.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => side.parties.list(businessId, { page, search }), [businessId, side.key, page, search, active]);

  const columns = partyColumns(side);
  if (!data && !error) return <TableSkeleton columns={columns.length} titleWidth="w-40" actions />;
  const items = data?.items ?? [];
  const plural = side.partyPlural.toLowerCase();

  return (
    <div>
      <PageHeader
        title={side.partyPlural}
        actions={canCreate && (
          <Button onClick={() => navigate({ new: 1 })}>
            <Plus />
            New {side.partyLabel}
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${plural}`} />
      </ListToolbar>
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ q: search, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={ICONS[side.key]} title={search ? `No ${plural} match this search` : `No ${plural} yet`} />
        ) : (
          <ListTable
            columns={columns}
            rows={items}
            totals={{ balance: data[side.balance.total] }}
            onView={(party) => navigate({ q: search, view: party.id })}
            onEdit={canEdit ? (party) => navigate({ q: search, edit: party.id }) : null}
          />
        )}
      </ListCard>
    </div>
  );
}
