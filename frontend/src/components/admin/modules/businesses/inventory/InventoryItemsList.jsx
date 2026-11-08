'use client';

import { Boxes, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, MoreMenu, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { inventoryItemsService } from '@/lib/services/inventory.service';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { plainNumber } from '../sales/sales-documents';
import { STICKY_KEY, useUrlSearch } from '../sales/sales-parts';
import { INVENTORY_TABS } from './inventory-documents';

/*
  Manager's widest list, every column in Manager's order. The table scrolls sideways inside its card with the
  item name kept in view (md+); phones get one card per item. `kind`: qty (plain number) or money.
*/
const COLUMNS = [
  { key: 'code', label: 'Item code' },
  { key: 'name', label: 'Item name' },
  { key: 'valuation_method_name', label: 'Valuation method' },
  { key: 'qty_owned', label: 'Qty owned', kind: 'qty' },
  { key: 'qty_to_deliver', label: 'Qty to deliver', kind: 'qty' },
  { key: 'qty_to_receive', label: 'Qty to receive', kind: 'qty' },
  { key: 'qty_on_hand', label: 'Qty on hand', kind: 'qty' },
  { key: 'qty_reserved', label: 'Qty reserved', kind: 'qty' },
  { key: 'qty_available', label: 'Qty available', kind: 'qty' },
  { key: 'qty_on_order', label: 'Qty on order', kind: 'qty' },
  { key: 'qty_to_be_available', label: 'Qty to be available', kind: 'qty' },
  { key: 'qty_desired', label: 'Qty desired', kind: 'qty' },
  { key: 'qty_to_order', label: 'Qty to order', kind: 'qty' },
  { key: 'average_cost', label: 'Average cost', kind: 'money' },
  { key: 'total_cost', label: 'Total cost', kind: 'money' },
];
const TOTAL_COST = 'total_cost';

function value(column, record) {
  if (column.kind === 'qty') return plainNumber(record[column.key]);
  if (column.kind === 'money') return formatMoney(record[column.key]);
  return record[column.key];
}

function ItemCell({ column, item, onOpen }) {
  if (column.key === 'name') {
    return (
      <TableCell data-card="title" className={cn(STICKY_KEY, 'min-w-40')}>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="link" className="text-foreground hover:text-link" onClick={(event) => { event.stopPropagation(); onOpen(item.id); }}>
            {item.name}
          </Button>
          {item.is_inactive && <InactiveBadge />}
        </span>
      </TableCell>
    );
  }
  const isTotal = column.key === TOTAL_COST;
  return (
    <TableCell
      className={cn(column.kind ? 'num' : 'whitespace-nowrap', column.key === 'code' && 'text-muted-foreground')}
      data-card={isTotal ? 'end' : undefined}
      data-label={isTotal ? undefined : column.label}
    >
      {value(column, item)}
    </TableCell>
  );
}

// The server's totals of every item, the label under the (sticky) item name; phones keep the total cost only.
function TotalsRow({ totals }) {
  return (
    <TableFooter>
      <TableRow className="hover:bg-transparent">
        {COLUMNS.map((column) => {
          const isName = column.key === 'name';
          return (
            <TableCell key={column.key} className={cn(column.kind && 'num', isName && STICKY_KEY, !isName && column.key !== TOTAL_COST && 'max-md:hidden')}>
              {isName ? 'Total' : column.kind && column.key in totals ? value(column, totals) : null}
            </TableCell>
          );
        })}
      </TableRow>
    </TableFooter>
  );
}

function ItemsTable({ data, onOpen }) {
  return (
    <Table data-testid="inventory-items-table">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((column) => (
            <TableHead key={column.key} className={cn(column.kind && 'text-end', column.key === 'name' && STICKY_KEY)}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((item) => (
          <TableRow key={item.id} className={cn('cursor-pointer', item.is_inactive && 'text-muted-foreground')} onClick={() => onOpen(item.id)}>
            {COLUMNS.map((column) => <ItemCell key={column.key} column={column} item={item} onOpen={onOpen} />)}
          </TableRow>
        ))}
      </TableBody>
      <TotalsRow totals={data.totals} />
    </Table>
  );
}

// ?tab=inventory-items[&q=search][&p=N]
export default function InventoryItemsList({ businessId, page, search, active, canCreate }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => inventoryItemsService.list(businessId, { page, search }), [businessId, page, search, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} />;
  const items = data?.items ?? [];

  const actions = (
    <>
      <MoreMenu items={[{ label: 'Cost corrections', icon: History, onSelect: () => navigate({ corrections: 1 }) }]} />
      {canCreate && (
        <Button onClick={() => navigate({ new: 1 })}>
          <Plus />
          New Inventory Item
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader title="Inventory Items" actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search inventory items" />
      </ListToolbar>
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ q: search, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Boxes} title={search ? 'Nothing matches this search' : 'No inventory items yet'} />
        ) : (
          <ItemsTable data={data} onOpen={(id) => navigate({ q: search, view: id })} />
        )}
      </ListCard>
    </div>
  );
}
