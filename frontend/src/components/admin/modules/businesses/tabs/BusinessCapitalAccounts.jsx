'use client';

import { useState } from 'react';
import { Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import {
  createCapitalAccount, deleteCapitalAccount, listCapitalAccounts, updateCapitalAccount,
} from '@/lib/services/capital-accounts.service';
import { formatMoney } from '@/lib/utils/money';
import { BANKING_TABS, InactiveBadge, TableSkeleton, useDocumentRoute, useLoad, useTabRights } from '../banking/banking-parts';
import NamedAccountDialog from '../banking/NamedAccountDialog';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';

const IN_USE = 'capital_account_in_use';
const IN_USE_MESSAGE = 'This capital account has transactions, so it cannot be deleted. Mark it Inactive instead.';

function CapitalTable({ rows, rights, onEdit, onDelete }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Name</TableHead>
          <TableHead>Code</TableHead>
          <TableHead className="text-end">Balance</TableHead>
          {(rights.edit || rights.delete) && <TableHead><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} className={cn(row.is_inactive && 'text-muted-foreground')}>
            <TableCell data-card="title">
              <span className="flex items-center gap-2">{row.name}{row.is_inactive && <InactiveBadge />}</span>
            </TableCell>
            <TableCell className="num" data-label="Code">{row.code}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(row.balance)}</TableCell>
            {(rights.edit || rights.delete) && (
              <TableCell className="w-12" data-card="actions">
                <MoreMenu
                  items={[
                    rights.edit && { label: 'Edit', icon: Pencil, onSelect: () => onEdit(row) },
                    rights.delete && { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => onDelete(row) },
                  ]}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ?tab=capital-accounts[&p=N]: owners' capital accounts with their balances (signed, from the API).
export default function BusinessCapitalAccounts({ business }) {
  const route = useDocumentRoute(BANKING_TABS.capital);
  const rights = useTabRights(BANKING_TABS.capital);
  const navigate = useTabNavigate(BANKING_TABS.capital);
  const { data, error: loadError, reload } = useLoad(
    () => listCapitalAccounts(business.id, route.page),
    [business.id, route.page, route.active],
  );
  const [dialog, setDialog] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!data && !loadError) return <TableSkeleton columns={3} />;

  async function save(body) {
    if (dialog.account) await updateCapitalAccount(business.id, dialog.account.id, body);
    else await createCapitalAccount(business.id, body);
    setDialog(null);
    reload();
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCapitalAccount(business.id, toDelete.id, toDelete.version);
      reload();
    } catch (err) {
      setError(err?.code === IN_USE ? IN_USE_MESSAGE : err?.message ?? 'Failed to delete the capital account.');
      if (isVersionConflict(err)) reload();
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  const items = data?.items ?? [];
  return (
    <div>
      {dialog && (
        <NamedAccountDialog
          title={dialog.account ? 'Edit Capital Account' : 'New Capital Account'}
          account={dialog.account}
          onSubmit={save}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        confirm={toDelete ? { title: 'Delete this capital account?', body: toDelete.name, action: 'Delete', destructive: true } : null}
        busy={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
        cancelLabel="Cancel"
      />
      <PageHeader
        title="Capital Accounts"
        actions={rights.create && <Button onClick={() => setDialog({ account: null })}><Plus />New Capital Account</Button>}
      />
      {(error || loadError) && <ErrorAlert>{error ?? loadError}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={route.page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(next) => navigate({ p: next > 1 ? next : null })}
          />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={PiggyBank} title="No capital accounts yet" />
        ) : (
          <CapitalTable rows={items} rights={rights} onEdit={(account) => setDialog({ account })} onDelete={setToDelete} />
        )}
      </ListCard>
    </div>
  );
}
