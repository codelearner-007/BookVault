'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import {
  deleteBankAccount, getBankAccount, updateBankAccount,
} from '@/lib/services/bank-accounts.service';
import { isVersionConflict } from '@/lib/services/api-client';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, DocumentSkeleton, InactiveBadge, useLoad } from './banking-parts';
import { BALANCE_COLUMNS } from './BankAccountsList';
import BankRegister, { registerParams } from './BankRegister';
import NamedAccountDialog from './NamedAccountDialog';

const IN_USE = 'bank_account_in_use';
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

// ?tab=bank-and-cash-accounts&view=<id>[&from=&to=&p=N]: the account, its balances and its register.
export default function BankAccountView({ businessId, accountId, page, range, rights }) {
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
      <div className="mt-10">
        <BankRegister
          businessId={businessId}
          accountId={account.id}
          page={page}
          range={range}
          onChange={(next) => navigate({ view: account.id, ...registerParams(next) })}
        />
      </div>
    </div>
  );
}
