'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import GroupSelect from './GroupSelect';
import { ACCOUNT_IN_USE, subtreeIds } from './coa-tree';

function Busy({ busy, children }) {
  return busy ? <Loader2 className="animate-spin" aria-label="Working" /> : children;
}

// Mounted only while open. A used account cannot be deleted (409 account_in_use): offer to mark it inactive.
export function DeleteAccountDialog({ account, onClose, onDelete, onMarkInactive }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [inUse, setInUse] = useState(false);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setInUse(err?.code === ACCOUNT_IN_USE);
      setError(err?.message ?? 'Failed to delete the account.');
      setBusy(false);
    }
  }

  const offerInactive = inUse && account.is_active;
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account?</AlertDialogTitle>
          <AlertDialogDescription>&quot;{account.name}&quot; will be permanently deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div role="alert" className="space-y-1 text-sm">
            <p className="text-bad">{error}</p>
            {offerInactive && <p className="text-muted-foreground">Mark it inactive instead: it stays in past transactions and reports but can no longer be chosen.</p>}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {offerInactive ? (
            <Button onClick={() => run(onMarkInactive)} disabled={busy}><Busy busy={busy}>Mark inactive</Busy></Button>
          ) : (
            <Button variant="destructive" onClick={() => run(onDelete)} disabled={busy || inUse}><Busy busy={busy}>Delete</Busy></Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Mounted only while open. The group's accounts and sub-groups move to another group of the same root.
export function DeleteGroupDialog({ group, entries, onClose, onDelete }) {
  const rootKey = entries.find((entry) => entry.group.id === group.id)?.rootKey;
  const excluded = subtreeIds(group);
  const targets = entries.filter((entry) => entry.rootKey === rootKey && !excluded.has(entry.group.id));
  const [moveTo, setMoveTo] = useState(group.parent_group_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await onDelete(moveTo);
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Failed to delete the group.');
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Group?</AlertDialogTitle>
          <AlertDialogDescription>&quot;{group.name}&quot; will be deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="group-move-to">Move its accounts and sub-groups to</Label>
          <GroupSelect id="group-move-to" entries={targets} value={moveTo} onChange={setMoveTo} disabled={busy} />
        </div>
        {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={busy || !moveTo}><Busy busy={busy}>Delete</Busy></Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
