'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, DocumentSkeleton, InactiveBadge, documentHref, useLoad } from '../banking/banking-parts';
import { PARTY_STATUS, TRADE_SIDES } from './sales-documents';
import { Field, StatusPill } from './sales-parts';

const CONTACT_IN_USE = 'contact_in_use';
const SKELETON_ROWS = 3;

// Customers add Uninvoiced, the default due date and the delivery address; suppliers keep one address.
function Details({ side, party }) {
  const isCustomer = side === TRADE_SIDES.sales;
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={side.balance.label}><span className="num font-semibold">{formatMoney(party[side.balance.field])}</span></Field>
        <Field label="Available credit"><span className="num">{formatMoney(party.available_credit)}</span></Field>
        {isCustomer && <Field label="Uninvoiced"><span className="num">{formatMoney(party.uninvoiced)}</span></Field>}
        <Field label="Status"><StatusPill statuses={PARTY_STATUS} status={party.status} /></Field>
        <Field label="Code">{party.code}</Field>
        <Field label="Email">{party.email}</Field>
        <Field label="Credit limit"><span className="num">{formatMoney(party.credit_limit)}</span></Field>
        {isCustomer && <Field label="Due date">{party.default_due_days === null ? null : `Net ${party.default_due_days} days`}</Field>}
        <Field label={isCustomer ? 'Billing address' : 'Address'} className="sm:col-span-2">{party.billing_address}</Field>
        {isCustomer && <Field label="Delivery address" className="sm:col-span-2">{party.delivery_address}</Field>}
      </dl>
    </Card>
  );
}

// Documents that moved the party's balance (signed effect on the receivable / payable).
function Transactions({ businessId, side, partyId, page, onPage }) {
  const { data, error } = useLoad(() => side.parties.transactions(businessId, partyId, page), [businessId, side.key, partyId, page]);
  return (
    <section aria-labelledby="party-transactions" className="mt-10">
      <h2 id="party-transactions" className="mb-3 text-md font-semibold">Transactions</h2>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard footer={data?.total > 0 && <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={onPage} />}>
        {!data && !error && (
          <div aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="mt-1 h-row w-full rounded-control" />)}
          </div>
        )}
        {data && data.items.length === 0 && <EmptyState title="No transactions yet" />}
        {data?.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={`${row.document_type}-${row.document_id}`}>
                  <TableCell className="num whitespace-nowrap" data-label="Date">{row.date}</TableCell>
                  <TableCell data-card="title">
                    <Link href={documentHref(row.document_type, row.document_id)} className="hover:text-link hover:underline">
                      {[DOCUMENT_TYPE_LABELS[row.document_type] ?? row.document_type, row.reference].filter(Boolean).join(' ')}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">{row.description}</TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
    </section>
  );
}

// ?tab=customers|suppliers&view=<id>[&p=N]: details, balance, available credit and transactions.
export default function PartyView({ businessId, side, partyId, page, rights }) {
  const navigate = useTabNavigate(side.tab);
  const { data: party, error, reload } = useLoad(() => side.parties.get(businessId, partyId), [businessId, side.key, partyId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!party) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;

  async function remove() {
    setDeleting(true);
    setActionError(null);
    try {
      await side.parties.remove(businessId, party.id, party.version);
      navigate({});
    } catch (err) {
      setActionError(err?.code === CONTACT_IN_USE
        ? `This ${side.partyNoun} has transactions, so it cannot be deleted. Mark it inactive instead.`
        : err?.message ?? `Failed to delete the ${side.partyNoun}.`);
      reload();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const actions = (
    <>
      {rights.delete && <MoreMenu items={[{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }]} />}
      {rights.edit && (
        <Button onClick={() => navigate({ edit: party.id })}>
          <Pencil />
          Edit
        </Button>
      )}
    </>
  );

  return (
    <div className="max-w-5xl">
      <ConfirmDialog
        confirm={confirmDelete ? { title: `Delete ${party.name}?`, body: `The ${side.partyNoun} is removed for good.`, action: 'Delete', destructive: true } : null}
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{party.name}{party.is_inactive && <InactiveBadge />}</span>}
        back={<BackButton onClick={() => navigate({})} />}
        actions={actions}
      />
      {actionError && <ErrorAlert>{actionError}</ErrorAlert>}
      <Details side={side} party={party} />
      <Transactions businessId={businessId} side={side} partyId={party.id} page={page} onPage={(next) => navigate({ view: party.id, p: next > 1 ? next : null })} />
    </div>
  );
}
