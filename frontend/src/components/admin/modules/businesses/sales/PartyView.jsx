'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { Money } from '@/components/common/money';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import {
  DOCUMENT_TYPE_LABELS, DocumentSkeleton, InactiveBadge, documentEditHref, documentHref, useDocumentEditRight, useLoad,
} from '../banking/banking-parts';
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
        <Field label={side.balance.label}><Money value={party[side.balance.field]} tone="balance" /></Field>
        <Field label="Available credit"><Money value={party.available_credit} /></Field>
        {isCustomer && <Field label="Uninvoiced"><Money value={party.uninvoiced} zero="muted" /></Field>}
        <Field label="Status"><StatusPill statuses={PARTY_STATUS} status={party.status} /></Field>
        <Field label="Code">{party.code}</Field>
        <Field label="Email">{party.email}</Field>
        <Field label="Credit limit"><Money value={party.credit_limit} /></Field>
        {isCustomer && <Field label="Due date">{party.default_due_days === null ? null : `Net ${party.default_due_days} days`}</Field>}
        <Field label={isCustomer ? 'Billing address' : 'Address'} className="sm:col-span-2">{party.billing_address}</Field>
        {isCustomer && <Field label="Delivery address" className="sm:col-span-2">{party.delivery_address}</Field>}
      </dl>
    </Card>
  );
}

const TRANSACTION_COLUMNS = [
  { key: 'date', label: 'Date', kind: COLUMN_KIND.date },
  {
    key: 'transaction',
    label: 'Transaction',
    card: 'title',
    value: (row) => [DOCUMENT_TYPE_LABELS[row.document_type] ?? row.document_type, row.reference].filter(Boolean).join(' '),
  },
  { key: 'description', label: 'Description', muted: true, truncate: true },
  { key: 'amount', label: 'Amount', kind: COLUMN_KIND.money, card: 'end' },
];

// Documents that moved the party's balance (signed effect on the receivable / payable).
function Transactions({ businessId, side, partyId, page, onPage }) {
  const router = useRouter();
  const canEdit = useDocumentEditRight();
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
          <ListTable
            columns={TRANSACTION_COLUMNS}
            rows={data.items}
            rowKey={(row) => `${row.document_type}-${row.document_id}`}
            onView={(row) => router.push(documentHref(row.document_type, row.document_id))}
            onEdit={(row) => router.push(documentEditHref(row.document_type, row.document_id))}
            canEdit={canEdit}
          />
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
