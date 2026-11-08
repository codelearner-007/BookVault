'use client';

import { useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog, ListPagination } from '@/components/super-admin/platform-parts';
import { isVersionConflict } from '@/lib/services/api-client';
import {
  createCapitalAccount, deleteCapitalAccount, listCapitalAccounts, updateCapitalAccount,
} from '@/lib/services/capital-accounts.service';
import { BANKING_TABS, InactiveBadge, TableSkeleton, useDocumentRoute, useLoad, useTabRights } from '../banking/banking-parts';
import NamedAccountDialog from '../banking/NamedAccountDialog';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';

const IN_USE = 'capital_account_in_use';
const IN_USE_MESSAGE = 'This capital account has transactions, so it cannot be deleted. Mark it Inactive instead.';

// Name and Balance (signed, from the API); codes show only in the Chart of Accounts.
const COLUMNS = [
  {
    key: 'name',
    label: 'Name',
    card: 'title',
    render: (row) => <RecordTitle text={row.name}>{row.is_inactive && <InactiveBadge />}</RecordTitle>,
  },
  { key: 'balance', label: 'Balance', kind: COLUMN_KIND.money, card: 'end' },
];

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

  if (!data && !loadError) return <TableSkeleton columns={COLUMNS.length} actions />;

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
          <ListTable
            columns={COLUMNS}
            rows={items}
            onEdit={rights.edit ? (account) => setDialog({ account }) : null}
            menu={rights.delete ? (account) => (
              <MoreMenu
                label={`Actions for ${account.name}`}
                items={[{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setToDelete(account) }]}
              />
            ) : undefined}
            rowClassName={(account) => account.is_inactive && 'text-muted-foreground'}
          />
        )}
      </ListCard>
    </div>
  );
}
