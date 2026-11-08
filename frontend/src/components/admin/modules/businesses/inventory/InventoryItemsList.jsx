'use client';

import { Boxes, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar, MoreMenu, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { inventoryItemsService } from '@/lib/services/inventory.service';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { useUrlSearch } from '../sales/sales-parts';
import { INVENTORY_TABS } from './inventory-documents';

// Manager's widest list, every column in Manager's order; phones get one card per item.
const COLUMNS = [
  { key: 'code', label: 'Item code', muted: true },
  {
    key: 'name',
    label: 'Item name',
    card: 'title',
    render: (item) => <RecordTitle text={item.name}>{item.is_inactive && <InactiveBadge />}</RecordTitle>,
  },
  { key: 'valuation_method_name', label: 'Valuation method' },
  { key: 'qty_owned', label: 'Qty owned', kind: COLUMN_KIND.qty },
  { key: 'qty_to_deliver', label: 'Qty to deliver', kind: COLUMN_KIND.qty },
  { key: 'qty_to_receive', label: 'Qty to receive', kind: COLUMN_KIND.qty },
  { key: 'qty_on_hand', label: 'Qty on hand', kind: COLUMN_KIND.qty },
  { key: 'qty_reserved', label: 'Qty reserved', kind: COLUMN_KIND.qty },
  { key: 'qty_available', label: 'Qty available', kind: COLUMN_KIND.qty },
  { key: 'qty_on_order', label: 'Qty on order', kind: COLUMN_KIND.qty },
  { key: 'qty_to_be_available', label: 'Qty to be available', kind: COLUMN_KIND.qty },
  { key: 'qty_desired', label: 'Qty desired', kind: COLUMN_KIND.qty },
  { key: 'qty_to_order', label: 'Qty to order', kind: COLUMN_KIND.qty },
  { key: 'average_cost', label: 'Average cost', kind: COLUMN_KIND.money },
  { key: 'total_cost', label: 'Total cost', kind: COLUMN_KIND.money, card: 'end' },
];

// The server's totals of every item under their columns (qty and money columns it sums).
function itemTotals(totals = {}) {
  return Object.fromEntries(COLUMNS.filter((column) => column.kind && column.key in totals).map((column) => [column.key, totals[column.key]]));
}

// ?tab=inventory-items[&q=search][&p=N]
export default function InventoryItemsList({ businessId, page, search, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => inventoryItemsService.list(businessId, { page, search }), [businessId, page, search, active]);

  if (!data && !error) return <TableSkeleton columns={COLUMNS.length} actions />;
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
          <div data-testid="inventory-items-table">
            <ListTable
              columns={COLUMNS}
              rows={items}
              totals={itemTotals(data.totals)}
              rowClassName={(item) => item.is_inactive && 'text-muted-foreground'}
              onView={(item) => navigate({ q: search, view: item.id })}
              onEdit={canEdit ? (item) => navigate({ q: search, edit: item.id }) : null}
            />
          </div>
        )}
      </ListCard>
    </div>
  );
}
