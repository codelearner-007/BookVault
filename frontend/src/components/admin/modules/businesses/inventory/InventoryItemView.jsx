'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { Quantity } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { inventoryItemsService, listItemMovements } from '@/lib/services/inventory.service';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, DocumentSkeleton, InactiveBadge, documentHref, useLoad } from '../banking/banking-parts';
import { Field } from '../sales/sales-parts';
import { INVENTORY_TABS } from './inventory-documents';

const SKELETON_ROWS = 4;

const LOCATION_COLUMNS = [
  { key: 'location_name', label: 'Inventory location', card: 'title' },
  { key: 'qty_on_hand', label: 'Qty on hand', kind: COLUMN_KIND.qty, card: 'end' },
];

const MOVEMENT_COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'document',
    label: 'Document',
    card: 'title',
    render: (movement) => (
      <Link href={documentHref(movement.document_type, movement.document_id)} className="hover:text-link hover:underline">
        {[DOCUMENT_TYPE_LABELS[movement.document_type], movement.reference].filter(Boolean).join(' ')}
      </Link>
    ),
  },
  { key: 'location_name', label: 'Inventory location' },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  { key: 'qty_owned', label: 'Qty owned', kind: COLUMN_KIND.qty },
  { key: 'qty_on_hand', label: 'Qty on hand', kind: COLUMN_KIND.qty },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
];

function ItemFields({ item }) {
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Item code">{item.code}</Field>
        <Field label="Item name">{item.name}</Field>
        <Field label="Unit name">{item.unit_name}</Field>
        <Field label="Valuation method">{item.valuation_method_name}</Field>
        <Field label="Qty desired"><Quantity value={item.qty_desired} /></Field>
        <Field label="Income account">{item.income_account_name ?? 'Inventory - sales'}</Field>
        <Field label="Expense account">{item.expense_account_name ?? 'Inventory - cost'}</Field>
        <Field label="Purchase unit price"><Money value={item.purchase_unit_price} /></Field>
        <Field label="Sales unit price"><Money value={item.sales_unit_price} /></Field>
        <Field label="Tax code">{item.tax_code_name}</Field>
        <Field label="Average cost"><Money value={item.average_cost} /></Field>
        <Field label="Total cost"><Money value={item.total_cost} /></Field>
        {item.description && <Field label="Description" className="sm:col-span-2 lg:col-span-3">{item.description}</Field>}
      </dl>
    </Card>
  );
}

function Section({ id, title, children }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="mb-3 text-md font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function LocationsTable({ item }) {
  return (
    <Section id="item-locations" title="Stock by location">
      <ListCard>
        {item.locations.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing on hand yet.</p>
        ) : (
          <ListTable
            columns={LOCATION_COLUMNS}
            rows={item.locations}
            rowKey={(location) => location.location_id}
            totals={{ qty_on_hand: item.qty_on_hand }}
          />
        )}
      </ListCard>
    </Section>
  );
}

// Every stock movement of the item, newest first, paged in ?p; each row opens its document.
function Movements({ businessId, itemId, page, onPage }) {
  const { data, error } = useLoad(() => listItemMovements(businessId, itemId, page), [businessId, itemId, page]);
  const items = data?.items ?? [];
  return (
    <Section id="item-movements" title="Movements">
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard footer={data?.total > 0 && <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={onPage} />}>
        {!data && !error && (
          <div aria-busy="true" className="space-y-1 p-2">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row rounded-control" />)}
          </div>
        )}
        {data && items.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No movements yet.</p>}
        {items.length > 0 && (
          <div data-testid="inventory-item-movements">
            <ListTable columns={MOVEMENT_COLUMNS} rows={items} />
          </div>
        )}
      </ListCard>
    </Section>
  );
}

// ?tab=inventory-items&view=<id>[&p=N]: the item, its stock per location and its movements; Edit / Delete.
export default function InventoryItemView({ businessId, itemId, page, rights }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const { data: item, error } = useLoad(() => inventoryItemsService.get(businessId, itemId), [businessId, itemId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!item) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;

  async function remove() {
    setBusy(true);
    setActionError(null);
    try {
      await inventoryItemsService.remove(businessId, item.id, item.version);
      navigate({});
    } catch (err) {
      setActionError(err?.message ?? 'Failed to delete the item.');
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const actions = (
    <>
      <MoreMenu items={[rights.delete && { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }]} />
      {rights.edit && (
        <Button onClick={() => navigate({ edit: item.id })}>
          <Pencil />
          Edit
        </Button>
      )}
    </>
  );

  return (
    <div className="max-w-5xl">
      <ConfirmDialog
        confirm={confirmDelete ? { title: `Delete ${item.name}?`, body: 'The inventory item is removed for good.', action: 'Delete', destructive: true } : null}
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{item.name}{item.is_inactive && <InactiveBadge />}</span>}
        back={<BackButton onClick={() => navigate({})} />}
        actions={actions}
      />
      {actionError && <ErrorAlert>{actionError}</ErrorAlert>}
      <ItemFields item={item} />
      <LocationsTable item={item} />
      <Movements businessId={businessId} itemId={item.id} page={page} onPage={(next) => navigate({ view: item.id, p: next > 1 ? next : null })} />
    </div>
  );
}
