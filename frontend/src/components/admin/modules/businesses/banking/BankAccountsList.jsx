'use client';

import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { Money } from '@/components/common/money';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { createBankAccount, listBankAccounts, updateBankAccount } from '@/lib/services/bank-accounts.service';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, InactiveBadge, TableSkeleton, useLoad } from './banking-parts';
import NamedAccountDialog from './NamedAccountDialog';

// Manager's four balances; the actual balance is the account's balance (emphasized, red when negative).
export const BALANCE_COLUMNS = [
  ['cleared_balance', 'Cleared balance'],
  ['pending_deposits', 'Pending deposits'],
  ['pending_withdrawals', 'Pending withdrawals'],
  ['actual_balance', 'Actual balance'],
];
const BALANCE_TONES = { pending_deposits: 'in', pending_withdrawals: 'out', actual_balance: 'balance' };

// The actual balance opens the account's register (every posted movement up to today).
function RegisterLink({ account, onOpenRegister }) {
  return (
    <Button
      variant="link"
      className="num h-auto p-0 text-inherit hover:text-link"
      aria-label={`Open the register of ${account.name}`}
      onClick={(event) => { event.stopPropagation(); onOpenRegister(account.id); }}
    >
      <Money value={account.actual_balance} tone="balance" />
    </Button>
  );
}

function accountColumns(onOpenRegister) {
  return [
    {
      key: 'name',
      label: 'Name',
      card: 'title',
      render: (account) => <RecordTitle text={account.name}>{account.is_inactive && <InactiveBadge />}</RecordTitle>,
    },
    ...BALANCE_COLUMNS.map(([key, label]) => ({
      key,
      label,
      kind: COLUMN_KIND.money,
      tone: BALANCE_TONES[key],
      zero: key === 'actual_balance' ? 'show' : 'muted',
      card: key === 'actual_balance' ? 'end' : undefined,
      render: key === 'actual_balance' ? (account) => <RegisterLink account={account} onOpenRegister={onOpenRegister} /> : undefined,
    })),
  ];
}

// ?tab=bank-and-cash-accounts[&p=N]: accounts with Manager's four balances and the totals row.
export default function BankAccountsList({ businessId, page, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(BANKING_TABS.bank);
  const [dialog, setDialog] = useState(null);
  // `active` in the deps: coming back to the tab reloads, so balances moved by other tabs show.
  const { data, error, reload } = useLoad(() => listBankAccounts(businessId, page), [businessId, page, active]);
  const columns = accountColumns((id) => navigate({ register: id }));

  if (!data && !error) return <TableSkeleton columns={columns.length} titleWidth="w-72" actions />;

  async function create(body) {
    const account = await createBankAccount(businessId, body);
    setDialog(null);
    navigate({ view: account.id });
  }

  async function update(body) {
    await updateBankAccount(businessId, dialog.account.id, body);
    setDialog(null);
    reload();
  }

  const items = data?.items ?? [];
  return (
    <>
      {dialog?.mode === 'new' && (
        <NamedAccountDialog title="New Bank or Cash Account" bank onSubmit={create} onClose={() => setDialog(null)} />
      )}
      {dialog?.mode === 'edit' && (
        <NamedAccountDialog title="Edit Bank or Cash Account" bank account={dialog.account} onSubmit={update} onClose={() => setDialog(null)} />
      )}
      <PageHeader
        title="Bank and Cash Accounts"
        actions={canCreate && (
          <Button onClick={() => setDialog({ mode: 'new' })}>
            <Plus />
            New Bank or Cash Account
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(next) => navigate({ p: next > 1 ? next : null })}
          />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Landmark} title="No bank or cash accounts yet" />
        ) : (
          <ListTable
            columns={columns}
            rows={items}
            totals={data.totals ?? undefined}
            onView={(account) => navigate({ view: account.id })}
            onEdit={canEdit ? (account) => setDialog({ mode: 'edit', account }) : null}
            rowClassName={(account) => account.is_inactive && 'text-muted-foreground'}
          />
        )}
      </ListCard>
    </>
  );
}
