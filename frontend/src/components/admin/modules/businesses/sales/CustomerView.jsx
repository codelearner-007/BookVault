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
import { deleteCustomer, getCustomer, listCustomerTransactions } from '@/lib/services/customers.service';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, DocumentSkeleton, InactiveBadge, documentHref, useLoad } from '../banking/banking-parts';
import { CUSTOMER_STATUS, SALES_TABS } from './sales-documents';
import { Field, StatusPill } from './sales-parts';

const CONTACT_IN_USE = 'contact_in_use';
const SKELETON_ROWS = 3;

function Details({ customer }) {
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Accounts receivable"><span className="num font-semibold">{formatMoney(customer.ar_balance)}</span></Field>
        <Field label="Available credit"><span className="num">{formatMoney(customer.available_credit)}</span></Field>
        <Field label="Uninvoiced"><span className="num">{formatMoney(customer.uninvoiced)}</span></Field>
        <Field label="Status"><StatusPill statuses={CUSTOMER_STATUS} status={customer.status} /></Field>
        <Field label="Code">{customer.code}</Field>
        <Field label="Email">{customer.email}</Field>
        <Field label="Credit limit"><span className="num">{formatMoney(customer.credit_limit)}</span></Field>
        <Field label="Due date">{customer.default_due_days === null ? null : `Net ${customer.default_due_days} days`}</Field>
        <Field label="Billing address" className="sm:col-span-2">{customer.billing_address}</Field>
        <Field label="Delivery address" className="sm:col-span-2">{customer.delivery_address}</Field>
      </dl>
    </Card>
  );
}

// Documents that moved the customer's receivable (+ invoices and fees, - receipts and credit notes).
function Transactions({ businessId, customerId, page, onPage }) {
  const { data, error } = useLoad(() => listCustomerTransactions(businessId, customerId, page), [businessId, customerId, page]);
  return (
    <section aria-labelledby="customer-transactions" className="mt-10">
      <h2 id="customer-transactions" className="mb-3 text-md font-semibold">Transactions</h2>
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

// ?tab=customers&view=<id>[&p=N]: details, receivable balance, available credit and transactions.
export default function CustomerView({ businessId, customerId, page, rights }) {
  const navigate = useTabNavigate(SALES_TABS.customers);
  const { data: customer, error, reload } = useLoad(() => getCustomer(businessId, customerId), [businessId, customerId]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!customer) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;

  async function remove() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteCustomer(businessId, customer.id, customer.version);
      navigate({});
    } catch (err) {
      setActionError(err?.code === CONTACT_IN_USE
        ? 'This customer has transactions, so it cannot be deleted. Mark it inactive instead.'
        : err?.message ?? 'Failed to delete the customer.');
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
        <Button onClick={() => navigate({ edit: customer.id })}>
          <Pencil />
          Edit
        </Button>
      )}
    </>
  );

  return (
    <div className="max-w-5xl">
      <ConfirmDialog
        confirm={confirmDelete ? { title: `Delete ${customer.name}?`, body: 'The customer is removed for good.', action: 'Delete', destructive: true } : null}
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{customer.name}{customer.is_inactive && <InactiveBadge />}</span>}
        back={<BackButton onClick={() => navigate({})} />}
        actions={actions}
      />
      {actionError && <ErrorAlert>{actionError}</ErrorAlert>}
      <Details customer={customer} />
      <Transactions businessId={businessId} customerId={customer.id} page={page} onPage={(next) => navigate({ view: customer.id, p: next > 1 ? next : null })} />
    </div>
  );
}
