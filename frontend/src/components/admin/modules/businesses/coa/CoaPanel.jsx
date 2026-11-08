'use client';

import { useImperativeHandle, useState } from 'react';
import { ArrowUpDown, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreMenu } from '@/components/common/page';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils/money';
import { isVersionConflict } from '@/lib/services/api-client';
import {
  createCoaAccount, createCoaGroup, deleteCoaAccount, deleteCoaGroup, reorderCoaAccounts, reorderCoaGroups,
  updateCoaAccount, updateCoaGroup,
} from '@/lib/services/coa.service';
import { setStartingBalance } from '@/lib/services/starting-balances.service';
import CoaAccountDialog from './CoaAccountDialog';
import CoaGroupDialog from './CoaGroupDialog';
import { DeleteAccountDialog, DeleteGroupDialog } from './CoaDeleteDialogs';
import ReorderModal from './ReorderModal';
import { STATEMENT_TITLES, flattenGroups, isZeroAmount } from './coa-tree';

const DIALOG = {
  group: 'group',
  account: 'account',
  deleteGroup: 'delete-group',
  deleteAccount: 'delete-account',
  reorderGroups: 'reorder-groups',
  reorderAccounts: 'reorder-accounts',
};

/* ── Rows ────────────────────────────────────────────────────────────────── */

// Nesting shows as start padding; phones indent less so long names keep room to wrap.
function NameCell({ depth, className, children }) {
  return (
    <TableCell
      style={{ '--depth': depth }}
      className={cn(
        'whitespace-normal break-words py-2 ps-[calc(1rem+var(--depth)*1.25rem)] max-md:ps-[calc(0.5rem+var(--depth)*0.75rem)]',
        className,
      )}
    >
      {children}
    </TableCell>
  );
}

function BalanceCell({ balance }) {
  return <TableCell className={cn('num w-px', isZeroAmount(balance) && 'text-muted-foreground')}>{formatMoney(balance)}</TableCell>;
}

function ActionsCell({ name, items }) {
  return (
    <TableCell className="w-px pe-2 ps-0">
      <MoreMenu label={`Actions for ${name}`} size="icon-sm" items={items} />
    </TableCell>
  );
}

function SystemBadge({ item }) {
  return item.is_system ? <Badge variant="role" className="ms-2 align-middle">System</Badge> : null;
}

function AccountRow({ account, depth, onAction }) {
  return (
    <TableRow>
      <NameCell depth={depth}>
        {account.code && <span className="me-2 tabular-nums text-muted-foreground">{account.code}</span>}
        <span className={cn(!account.is_active && 'text-muted-foreground')}>{account.name}</span>
        <SystemBadge item={account} />
        {!account.is_active && <Badge variant="neutral" className="ms-2 align-middle">Inactive</Badge>}
      </NameCell>
      <BalanceCell balance={account.balance} />
      <ActionsCell
        name={account.name}
        items={[
          { label: 'Edit', icon: Pencil, onSelect: () => onAction(DIALOG.account, account) },
          !account.is_system && {
            label: 'Delete', icon: Trash2, destructive: true, separatorBefore: true,
            onSelect: () => onAction(DIALOG.deleteAccount, account),
          },
        ]}
      />
    </TableRow>
  );
}

// A group row, then its accounts, then its sub-groups (each one level deeper).
function GroupRows({ group, depth, onAction }) {
  const isRoot = Boolean(group.root_key);
  return (
    <>
      <TableRow>
        <NameCell depth={depth} className={isRoot ? 'font-semibold' : 'font-medium'}>
          {group.name}
          <SystemBadge item={group} />
        </NameCell>
        <BalanceCell balance={group.balance} />
        <ActionsCell
          name={group.name}
          items={[
            { label: isRoot ? 'Rename' : 'Edit', icon: Pencil, onSelect: () => onAction(DIALOG.group, group) },
            group.groups.length > 1 && { label: 'Reorder sub-groups', icon: ArrowUpDown, onSelect: () => onAction(DIALOG.reorderGroups, group) },
            group.accounts.length > 1 && { label: 'Reorder accounts', icon: ArrowUpDown, onSelect: () => onAction(DIALOG.reorderAccounts, group) },
            !group.is_system && {
              label: 'Delete', icon: Trash2, destructive: true, separatorBefore: true,
              onSelect: () => onAction(DIALOG.deleteGroup, group),
            },
          ]}
        />
      </TableRow>
      {group.accounts.map((account) => <AccountRow key={account.id} account={account} depth={depth + 1} onAction={onAction} />)}
      {group.groups.map((child) => <GroupRows key={child.id} group={child} depth={depth + 1} onAction={onAction} />)}
    </>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

// One statement (Balance Sheet or Profit and Loss) of the chart. `ref` exposes the create actions
// so the page header can open them. onRefresh(notice?) reloads the tree, showing `notice` above it.
export default function CoaPanel({ ref, statement, roots, openingDate, businessId, onRefresh }) {
  const [dialog, setDialog] = useState(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const entries = flattenGroups(roots);
  const defaultGroupId = roots[0]?.id;
  const close = () => setDialog(null);

  useImperativeHandle(ref, () => ({
    openNewGroup: () => setDialog({ kind: DIALOG.group, item: null }),
    openNewAccount: () => setDialog({ kind: DIALOG.account, item: null }),
  }), []);

  // A version conflict reloads the chart with the message (the dialog closes); other errors stay in the dialog.
  async function guarded(action) {
    try {
      await action();
    } catch (err) {
      if (!isVersionConflict(err)) throw err;
      await onRefresh(err.message);
    }
  }

  const saveGroup = (payload) => guarded(async () => {
    const group = dialog.item;
    if (group) await updateCoaGroup(businessId, group.id, { ...payload, version: group.version });
    else await createCoaGroup(businessId, { ...payload, type: statement });
    await onRefresh();
  });

  // The starting balance is a separate write after the account; its failure is reported, not fatal.
  async function saveOpening(accountId, opening) {
    try {
      await setStartingBalance(businessId, accountId, opening);
      return null;
    } catch (err) {
      return `The account was saved, but its starting balance was not: ${err?.message ?? 'request failed'}`;
    }
  }

  const saveAccount = (payload, opening) => guarded(async () => {
    const account = dialog.item;
    const saved = account
      ? await updateCoaAccount(businessId, account.id, { ...payload, version: account.version })
      : await createCoaAccount(businessId, payload);
    const notice = opening ? await saveOpening(account?.id ?? saved.id, opening) : null;
    await onRefresh(notice);
  });

  const deleteGroup = (moveTo) => guarded(async () => {
    await deleteCoaGroup(businessId, dialog.item.id, dialog.item.version, moveTo);
    await onRefresh();
  });

  const deleteAccount = () => guarded(async () => {
    await deleteCoaAccount(businessId, dialog.item.id, dialog.item.version);
    await onRefresh();
  });

  const markInactive = () => guarded(async () => {
    await updateCoaAccount(businessId, dialog.item.id, { version: dialog.item.version, is_active: false });
    await onRefresh();
  });

  async function saveOrder(ordered) {
    const items = ordered.map((item) => item.id);
    const group = dialog.item;
    setReorderSaving(true);
    try {
      if (dialog.kind === DIALOG.reorderGroups) {
        await reorderCoaGroups(businessId, { type: statement, parent_group_id: group.id, items });
      } else {
        await reorderCoaAccounts(businessId, { group_id: group.id, items });
      }
      close();
      await onRefresh();
    } catch (err) {
      close();
      await onRefresh(err?.message ?? 'Failed to save the order.');
    } finally {
      setReorderSaving(false);
    }
  }

  const kind = dialog?.kind;
  const item = dialog?.item;
  const dialogKey = item?.id ?? 'new';

  return (
    <>
      {kind === DIALOG.group && (
        <CoaGroupDialog key={dialogKey} group={item} entries={entries} defaultParentId={defaultGroupId} onClose={close} onSave={saveGroup} />
      )}
      {kind === DIALOG.account && (
        <CoaAccountDialog
          key={dialogKey}
          account={item}
          statement={statement}
          entries={entries}
          defaultGroupId={defaultGroupId}
          openingDate={openingDate}
          onClose={close}
          onSave={saveAccount}
        />
      )}
      {kind === DIALOG.deleteGroup && <DeleteGroupDialog key={dialogKey} group={item} entries={entries} onClose={close} onDelete={deleteGroup} />}
      {kind === DIALOG.deleteAccount && (
        <DeleteAccountDialog key={dialogKey} account={item} onClose={close} onDelete={deleteAccount} onMarkInactive={markInactive} />
      )}
      {(kind === DIALOG.reorderGroups || kind === DIALOG.reorderAccounts) && (
        <ReorderModal
          key={`${kind}-${dialogKey}`}
          title={`Reorder: ${item.name}`}
          items={kind === DIALOG.reorderGroups ? item.groups : item.accounts}
          onSave={saveOrder}
          onClose={() => !reorderSaving && close()}
          saving={reorderSaving}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{STATEMENT_TITLES[statement]}</CardTitle>
        </CardHeader>
        <div className="px-2 pb-2 max-md:px-0">
          <Table cards={false} aria-label={STATEMENT_TITLES[statement]}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="text-end">Balance</TableHead>
                <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roots.map((root) => (
                <GroupRows key={root.id} group={root} depth={0} onAction={(nextKind, target) => setDialog({ kind: nextKind, item: target })} />
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
