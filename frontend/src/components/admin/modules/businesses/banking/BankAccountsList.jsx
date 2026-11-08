'use client';

import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { createBankAccount, listBankAccounts } from '@/lib/services/bank-accounts.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, InactiveBadge, TableSkeleton, useLoad } from './banking-parts';
import NamedAccountDialog from './NamedAccountDialog';

export const BALANCE_COLUMNS = [
  ['cleared_balance', 'Cleared balance'],
  ['pending_deposits', 'Pending deposits'],
  ['pending_withdrawals', 'Pending withdrawals'],
  ['actual_balance', 'Actual balance'],
];

function AccountsTable({ accounts, totals, onOpen }) {
  const showCode = accounts.some((account) => account.code);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {showCode && <TableHead>Code</TableHead>}
          <TableHead>Name</TableHead>
          {BALANCE_COLUMNS.map(([key, label]) => <TableHead key={key} className="text-end">{label}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow
            key={account.id}
            className={cn('cursor-pointer', account.is_inactive && 'text-muted-foreground')}
            onClick={() => onOpen(account.id)}
          >
            {showCode && <TableCell className="num whitespace-nowrap" data-label="Code">{account.code}</TableCell>}
            <TableCell data-card="title">
              <span className="flex items-center gap-2">
                <Button
                  variant="link"
                  className="h-auto p-0 text-inherit hover:text-link"
                  onClick={(event) => { event.stopPropagation(); onOpen(account.id); }}
                >
                  {account.name}
                </Button>
                {account.is_inactive && <InactiveBadge />}
              </span>
            </TableCell>
            {BALANCE_COLUMNS.map(([key, label]) => (
              <TableCell key={key} className="num" data-label={label} data-card={key === 'actual_balance' ? 'end' : undefined}>
                {formatMoney(account[key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {totals && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={showCode ? 2 : 1}>Total</TableCell>
            {BALANCE_COLUMNS.map(([key, label]) => (
              <TableCell key={key} className="num" data-label={label}>{formatMoney(totals[key])}</TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

// ?tab=bank-and-cash-accounts[&p=N]: accounts with Manager's four balances and the totals row.
export default function BankAccountsList({ businessId, page, active, canCreate }) {
  const navigate = useTabNavigate(BANKING_TABS.bank);
  const [creating, setCreating] = useState(false);
  // `active` in the deps: coming back to the tab reloads, so balances moved by other tabs show.
  const { data, error } = useLoad(() => listBankAccounts(businessId, page), [businessId, page, active]);

  if (!data && !error) return <TableSkeleton columns={5} titleWidth="w-72" />;

  async function create(body) {
    const account = await createBankAccount(businessId, body);
    setCreating(false);
    navigate({ view: account.id });
  }

  const items = data?.items ?? [];
  return (
    <div>
      {creating && (
        <NamedAccountDialog title="New Bank or Cash Account" bank onSubmit={create} onClose={() => setCreating(false)} />
      )}
      <PageHeader
        title="Bank and Cash Accounts"
        actions={canCreate && (
          <Button onClick={() => setCreating(true)}>
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
          <AccountsTable accounts={items} totals={data.totals} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
