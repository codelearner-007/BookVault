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
import {
  deleteBankAccount, getBankAccount, listBankAccountTransactions, updateBankAccount,
} from '@/lib/services/bank-accounts.service';
import { isVersionConflict } from '@/lib/services/api-client';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import {
  BANKING_TABS, DOCUMENT_TYPE_LABELS, DocumentSkeleton, InactiveBadge, PendingBadge, documentHref, useLoad,
} from './banking-parts';
import { BALANCE_COLUMNS } from './BankAccountsList';
import NamedAccountDialog from './NamedAccountDialog';

const IN_USE = 'bank_account_in_use';
const SKELETON_ROWS = 4;
const IN_USE_MESSAGE = 'This account has transactions or a starting balance, so it cannot be deleted. Mark it Inactive instead.';

function AccountCard({ account }) {
  return (
    <Card className="p-card">
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Name</dt><dd className="mt-1 font-semibold">{account.name}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Code</dt><dd className="mt-1">{account.code || '—'}</dd></div>
        <div>
          <dt className="text-sm text-muted-foreground">Pending transactions</dt>
          <dd className="mt-1">{account.can_have_pending ? 'Allowed' : 'Not allowed'}</dd>
        </div>
      </dl>
      {account.description && <p className="mt-6 whitespace-pre-wrap text-muted-foreground">{account.description}</p>}
      <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-border pt-6 sm:grid-cols-4">
        {BALANCE_COLUMNS.map(([key, label]) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="num mt-1 text-start font-semibold">{formatMoney(account[key])}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TransactionsTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.document_id}-${index}`}>
            <TableCell className="num whitespace-nowrap" data-label="Date">{row.date}</TableCell>
            <TableCell data-card="title">
              <Link href={documentHref(row.document_type, row.document_id)} className="hover:text-link">
                {DOCUMENT_TYPE_LABELS[row.document_type] ?? row.document_type}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground" data-label="Reference">{row.reference}</TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" data-label="Description">
              <span className="flex items-center gap-2">{row.description}{row.is_pending && <PendingBadge />}</span>
            </TableCell>
            <TableCell className="num" data-card="end">{formatMoney(row.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Transactions({ businessId, accountId, page, onPage }) {
  const { data, error } = useLoad(
    () => listBankAccountTransactions(businessId, accountId, page),
    [businessId, accountId, page],
  );
  return (
    <section aria-labelledby="bank-transactions" className="mt-10">
      <h2 id="bank-transactions" className="mb-3 text-md font-semibold">Transactions</h2>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={onPage} />
        )}
      >
        {!data && !error && (
          <div className="space-y-1 p-2" aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full rounded-control" />)}
          </div>
        )}
        {data && data.items.length === 0 && <EmptyState title="No transactions yet" />}
        {data && data.items.length > 0 && <TransactionsTable rows={data.items} />}
      </ListCard>
    </section>
  );
}

// ?tab=bank-and-cash-accounts&view=<id>[&p=N]: the account, its balances and its transactions.
export default function BankAccountView({ businessId, accountId, page, rights }) {
  const navigate = useTabNavigate(BANKING_TABS.bank);
  const { data: account, error: loadError, reload } = useLoad(() => getBankAccount(businessId, accountId), [businessId, accountId]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!account) return loadError ? <ErrorAlert>{loadError}</ErrorAlert> : <DocumentSkeleton />;

  async function update(body) {
    await updateBankAccount(businessId, account.id, body);
    setEditing(false);
    reload();
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteBankAccount(businessId, account.id, account.version);
      navigate({});
    } catch (err) {
      setError(err?.code === IN_USE ? IN_USE_MESSAGE : err?.message ?? 'Failed to delete the account.');
      if (isVersionConflict(err)) reload();
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const actions = (
    <>
      {rights.delete && (
        <MoreMenu items={[{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }]} />
      )}
      {rights.edit && <Button onClick={() => setEditing(true)}><Pencil />Edit</Button>}
    </>
  );

  return (
    <div className="max-w-4xl">
      {editing && (
        <NamedAccountDialog title="Edit Bank or Cash Account" bank account={account} onSubmit={update} onClose={() => setEditing(false)} />
      )}
      <ConfirmDialog
        confirm={confirmDelete ? { title: 'Delete this account?', body: account.name, action: 'Delete', destructive: true } : null}
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{account.name}{account.is_inactive && <InactiveBadge />}</span>}
        description="Bank or Cash Account"
        back={<BackButton onClick={() => navigate({})} />}
        actions={actions}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <AccountCard account={account} />
      <Transactions
        businessId={businessId}
        accountId={account.id}
        page={page}
        onPage={(next) => navigate({ view: account.id, p: next > 1 ? next : null })}
      />
    </div>
  );
}
