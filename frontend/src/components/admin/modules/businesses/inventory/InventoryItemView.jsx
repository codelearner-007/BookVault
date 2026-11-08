'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { inventoryItemsService, listItemMovements } from '@/lib/services/inventory.service';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { DocumentSkeleton, InactiveBadge, useLoad } from '../banking/banking-parts';
import { plainNumber } from '../sales/sales-documents';
import { Field } from '../sales/sales-parts';
import { INVENTORY_TABS, stockDocumentHref, stockDocumentLabel } from './inventory-documents';

const SKELETON_ROWS = 4;

function ItemFields({ item }) {
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Item code">{item.code}</Field>
        <Field label="Item name">{item.name}</Field>
        <Field label="Unit name">{item.unit_name}</Field>
        <Field label="Valuation method">{item.valuation_method_name}</Field>
        <Field label="Qty desired"><span className="tabular-nums">{plainNumber(item.qty_desired)}</span></Field>
        <Field label="Income account">{item.income_account_name ?? 'Inventory - sales'}</Field>
        <Field label="Expense account">{item.expense_account_name ?? 'Inventory - cost'}</Field>
        <Field label="Purchase unit price"><span className="tabular-nums">{formatMoney(item.purchase_unit_price)}</span></Field>
        <Field label="Sales unit price"><span className="tabular-nums">{formatMoney(item.sales_unit_price)}</span></Field>
        <Field label="Tax code">{item.tax_code_name}</Field>
        <Field label="Average cost"><span className="tabular-nums">{formatMoney(item.average_cost)}</span></Field>
        <Field label="Total cost"><span className="tabular-nums">{formatMoney(item.total_cost)}</span></Field>
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Inventory location</TableHead>
                <TableHead className="text-end">Qty on hand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.locations.map((location) => (
                <TableRow key={location.location_id}>
                  <TableCell data-card="title">{location.location_name}</TableCell>
                  <TableCell className="num" data-card="end">{plainNumber(location.qty_on_hand)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell>Total</TableCell>
                <TableCell className="num">{plainNumber(item.qty_on_hand)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
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
          <Table data-testid="inventory-item-movements">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Inventory location</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-end">Qty owned</TableHead>
                <TableHead className="text-end">Qty on hand</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="num whitespace-nowrap" data-label="Date">{movement.date}</TableCell>
                  <TableCell data-card="title">
                    <Link href={stockDocumentHref(movement.document_type, movement.document_id)} className="hover:text-link hover:underline">
                      {[stockDocumentLabel(movement.document_type), movement.reference].filter(Boolean).join(' ')}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Location">{movement.location_name}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">{movement.description}</TableCell>
                  <TableCell className="num" data-label="Qty owned">{plainNumber(movement.qty_owned)}</TableCell>
                  <TableCell className="num" data-label="Qty on hand">{plainNumber(movement.qty_on_hand)}</TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(movement.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
