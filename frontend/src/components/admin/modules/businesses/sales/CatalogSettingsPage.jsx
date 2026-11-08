'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable, RecordTitle } from '@/components/common/list-table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_CREATE, RIGHT_DELETE, RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { ErrorAlert } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { accountsFromTree } from '../coa/coa-tree';

export function SettingsBackButton() {
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
    </Button>
  );
}

// Every account under the given COA roots (e.g. income, expenses), active ones only, with its head group.
export function accountsUnder(tree, rootKeys) {
  return accountsFromTree(tree, (account, root) => account.is_active && rootKeys.includes(root.root_key));
}

// The page's columns as list-table columns: the first is the record's name (with Inactive), numeric ones end-align.
function listColumns(columns) {
  return columns.map((column, index) => ({
    key: column.key,
    label: column.label,
    kind: column.kind ?? (column.numeric ? COLUMN_KIND.qty : COLUMN_KIND.text),
    card: index === 0 ? 'title' : undefined,
    value: column.value,
    render: index === 0
      ? (record) => <RecordTitle text={column.render(record)}>{record.is_inactive && <InactiveBadge />}</RecordTitle>
      : column.render,
  }));
}

/*
  A settings catalog page (tax codes, non-inventory items): the list, New / Edit in a dialog
  (a bottom sheet on phones), Delete with the server's "in use" refusal.
  columns: [{ key, label, numeric | kind, render(record) | value(record) }]; the first column is the record's name;
    a 'money' column with value() is formatted by the shared <Money>.
  renderDialog({ record, onClose, onSaved }): the New (record null) / Edit dialog.
  canDelete(record): false hides Delete for a record the server never deletes (the default inventory location).
*/
export default function CatalogSettingsPage({
  businessId, title, noun, area, service, columns, inUseCode, inUseMessage, icon, renderDialog, canDelete = () => true,
}) {
  const { access } = useBusinessWorkspace();
  const rights = { create: can(access, area, RIGHT_CREATE), edit: can(access, area, RIGHT_EDIT), delete: can(access, area, RIGHT_DELETE) };
  const { data, error, reload } = useLoad(() => service.listAll(businessId), [businessId]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!data && !error) return <TableSkeleton columns={columns.length} actions />;

  async function remove() {
    setBusy(true);
    setActionError(null);
    try {
      await service.remove(businessId, deleting.id, deleting.version);
    } catch (err) {
      setActionError(err?.code === inUseCode ? inUseMessage : err?.message ?? `Failed to delete the ${noun}.`);
    } finally {
      setBusy(false);
      setDeleting(null);
      reload();
    }
  }

  const items = data?.items ?? [];
  const newButton = rights.create && (
    <Button onClick={() => setEditing({ record: null })}>
      <Plus />
      New {noun}
    </Button>
  );

  return (
    <>
      {editing && renderDialog({ record: editing.record, onClose: () => setEditing(null), onSaved: () => { setEditing(null); reload(); } })}
      <ConfirmDialog
        confirm={deleting ? { title: `Delete ${deleting.name}?`, body: `The ${noun} is removed for good.`, action: 'Delete', destructive: true } : null}
        busy={busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
        cancelLabel="Cancel"
      />
      <PageHeader title={title} back={<SettingsBackButton />} actions={newButton} />
      {(error || actionError) && <ErrorAlert>{error ?? actionError}</ErrorAlert>}
      <ListCard>
        {items.length === 0 ? (
          <EmptyState icon={icon} title={`No ${title.toLowerCase()} yet`} />
        ) : (
          <ListTable
            columns={listColumns(columns)}
            rows={items}
            onEdit={rights.edit ? (record) => setEditing({ record }) : null}
            menu={rights.delete ? (record) => canDelete(record) && (
              <MoreMenu
                label={`Actions for ${record.name}`}
                items={[{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleting(record) }]}
              />
            ) : undefined}
          />
        )}
      </ListCard>
    </>
  );
}
