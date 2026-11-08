'use client';

import { Plus, Truck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { PARTY_STATUS } from './sales-documents';
import { STICKY_KEY, StatusPill, useUrlSearch } from './sales-parts';

// Manager's columns after Name, per side: Customers add Uninvoiced and Available credit; Suppliers do not.
const COLUMNS = {
  sales: ['uninvoiced', 'balance', 'status', 'availableCredit'],
  purchases: ['balance', 'status'],
};
const MONEY = new Set(['uninvoiced', 'balance', 'availableCredit']);
const ICONS = { sales: Users, purchases: Truck };

function headLabel(key, side) {
  if (key === 'balance') return side.balance.label;
  return { uninvoiced: 'Uninvoiced', status: 'Status', availableCredit: 'Available credit' }[key];
}

function cell(key, party, side) {
  if (key === 'balance') return <TableCell key={key} className="num" data-card="end">{formatMoney(party[side.balance.field])}</TableCell>;
  if (key === 'status') return <TableCell key={key} data-label="Status"><StatusPill statuses={PARTY_STATUS} status={party.status} /></TableCell>;
  const field = key === 'uninvoiced' ? 'uninvoiced' : 'available_credit';
  return <TableCell key={key} className="num" data-label={headLabel(key, side)}>{formatMoney(party[field])}</TableCell>;
}

function PartiesTable({ side, data, onOpen }) {
  const columns = COLUMNS[side.key];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={STICKY_KEY}>Name</TableHead>
          {columns.map((key) => <TableHead key={key} className={cn(MONEY.has(key) && 'text-end')}>{headLabel(key, side)}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((party) => (
          <TableRow key={party.id} className="cursor-pointer" onClick={() => onOpen(party.id)}>
            <TableCell data-card="title" className={STICKY_KEY}>
              <span className="flex flex-wrap items-center gap-2">
                <Button variant="link" className="text-foreground hover:text-link" onClick={(event) => { event.stopPropagation(); onOpen(party.id); }}>
                  {party.name}
                </Button>
                {party.is_inactive && <InactiveBadge />}
              </span>
            </TableCell>
            {columns.map((key) => cell(key, party, side))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell>Total</TableCell>
          {columns.map((key) => (key === 'balance'
            ? <TableCell key={key} className="num" data-label={side.balance.label}>{formatMoney(data[side.balance.total])}</TableCell>
            : <TableCell key={key} className="max-md:hidden" />))}
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// ?tab=customers|suppliers[&q=search][&p=N]: Manager's columns, the receivable / payable total from the server.
export default function PartiesList({ businessId, side, page, search, active, canCreate }) {
  const navigate = useTabNavigate(side.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => side.parties.list(businessId, { page, search }), [businessId, side.key, page, search, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS[side.key].length + 1} titleWidth="w-40" />;
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
          <PartiesTable side={side} data={data} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
