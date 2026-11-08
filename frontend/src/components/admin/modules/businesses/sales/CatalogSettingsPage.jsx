'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_CREATE, RIGHT_DELETE, RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { cn } from '@/lib/utils';
import { ErrorAlert } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { STICKY_KEY } from './sales-parts';

export function SettingsBackButton() {
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
    </Button>
  );
}

// Every account under the given COA roots (e.g. income, expenses), active ones only.
export function accountsUnder(tree, rootKeys) {
  const accounts = [];
  const walk = (group) => {
    group.accounts.forEach((account) => { if (account.is_active) accounts.push(account); });
    group.groups.forEach(walk);
  };
  tree.roots.filter((root) => rootKeys.includes(root.root_key)).forEach(walk);
  return accounts;
}

/*
  A settings catalog page (tax codes, non-inventory items): the list, New / Edit in a dialog
  (a bottom sheet on phones), Delete with the server's "in use" refusal.
  columns: [{ key, label, numeric, render(record) }]; the first column is the record's name.
  renderDialog({ record, onClose, onSaved }): the New (record null) / Edit dialog.
*/
export default function CatalogSettingsPage({ businessId, title, noun, area, service, columns, inUseCode, inUseMessage, icon, renderDialog }) {
  const { access } = useBusinessWorkspace();
  const rights = { create: can(access, area, RIGHT_CREATE), edit: can(access, area, RIGHT_EDIT), delete: can(access, area, RIGHT_DELETE) };
  const { data, error, reload } = useLoad(() => service.listAll(businessId), [businessId]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (!data && !error) return <TableSkeleton columns={columns.length + 1} />;

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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((column, index) => (
                  <TableHead key={column.key} className={cn(column.numeric && 'text-end', index === 0 && STICKY_KEY)}>{column.label}</TableHead>
                ))}
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((record) => (
                <TableRow key={record.id}>
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.key}
                      className={cn(column.numeric && 'num', index === 0 && STICKY_KEY)}
                      data-card={index === 0 ? 'title' : undefined}
                      data-label={index === 0 ? undefined : column.label}
                    >
                      {index === 0 ? (
                        <span className="flex flex-wrap items-center gap-2">{column.render(record)}{record.is_inactive && <InactiveBadge />}</span>
                      ) : column.render(record)}
                    </TableCell>
                  ))}
                  <TableCell data-card="actions" className="w-12 text-end">
                    <MoreMenu
                      label={`Actions for ${record.name}`}
                      items={[
                        rights.edit && { label: 'Edit', icon: Pencil, onSelect: () => setEditing({ record }) },
                        rights.delete && { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleting(record) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
    </>
  );
}
