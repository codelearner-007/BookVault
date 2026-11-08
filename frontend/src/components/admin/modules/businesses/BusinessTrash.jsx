'use client';

import { useState } from 'react';
import { ArchiveRestore, Building2, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/page';
import { Monogram } from '@/components/shell/BusinessSwitcher';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';
import {
  deleteBusiness, exportBusiness, listBusinesses, listDeletedBusinesses, permanentDeleteBusiness, restoreBusiness,
} from '@/lib/services/business.service';

/* Remove (to Trash), Trash (restore), and permanent delete: the Businesses page's More menu flows. */

const SKELETON_ROWS = 3;
const destructiveAction = buttonVariants({ variant: 'destructive' });

function errorText(err, fallback) {
  return err instanceof Error ? err.message : fallback;
}

function TrashSkeleton() {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => (
    <div key={i} className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-mono-sm shrink-0 rounded-menu-item" />
      <Skeleton className="h-4 flex-1" />
    </div>
  ));
}

function RemoveBusinessDialog({ open, onOpenChange, businesses, selectedId, onSelect, onContinue }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove business</DialogTitle>
          <DialogDescription>Select the business to move to Trash. Only businesses you own are listed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="remove-select">Business</Label>
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger id="remove-select" className="w-full">
              <SelectValue placeholder="Select a business…" />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((biz) => (
                <SelectItem key={biz.id} value={biz.id}>
                  {biz.name}{biz.country ? ` — ${biz.country}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onContinue} disabled={!selectedId}>Remove business</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmRemoveDialog({ open, onOpenChange, name, loading, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move &quot;{name ?? 'this business'}&quot; to Trash?</AlertDialogTitle>
          <AlertDialogDescription>
            Nobody can open it while it is in Trash. You can restore it from Deleted businesses.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading} className={`${destructiveAction} min-w-20`}>
            {loading ? <><Loader2 className="animate-spin" />Moving…</> : 'Move to Trash'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeletedBusinessRow({ biz, restoring, onRestore, onPurge }) {
  return (
    <li className="flex items-center gap-3 rounded-control px-4 py-3 transition-colors duration-150 hover:bg-row-hover">
      <Monogram name={biz.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{biz.name}</p>
        {biz.country && <p className="mt-0.5 truncate text-sm text-muted-foreground">{biz.country}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onRestore} disabled={restoring} aria-label={`Restore ${biz.name}`}>
          {restoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onPurge} className="hover:text-bad" aria-label={`Permanently delete ${biz.name}`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function TrashDialog({ open, onOpenChange, loading, businesses, restoringId, onRestore, onPurge }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.deletedBusinesses}</DialogTitle>
          <DialogDescription>Restore a business to open it again, or delete it permanently.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-72 overflow-y-auto">
          {loading && <TrashSkeleton />}
          {!loading && businesses.length === 0 && <EmptyState icon={Building2} title="Trash is empty" className="py-8" />}
          {!loading && businesses.length > 0 && (
            <ul className="divide-y divide-row-divider">
              {businesses.map((biz) => (
                <DeletedBusinessRow
                  key={biz.id}
                  biz={biz}
                  restoring={restoringId === biz.id}
                  onRestore={() => onRestore(biz.id)}
                  onPurge={() => onPurge(biz)}
                />
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermanentDeleteDialog({ open, onOpenChange, name, typed, onTypedChange, loading, exporting, onExport, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete business?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-semibold text-foreground">{name}</span> will be{' '}
            <span className="font-semibold text-bad">permanently deleted</span> and cannot be recovered.
            {' '}You may be asked to sign in again first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4">
          <Button variant="secondary" onClick={onExport} disabled={exporting} className="w-full">
            {exporting ? 'Preparing backup…' : 'Download a full backup'}
          </Button>
          <div className="grid gap-2">
            <Label htmlFor="permanent-delete-confirmation">Type the business name to confirm</Label>
            <Input
              id="permanent-delete-confirmation"
              value={typed}
              onChange={(e) => onTypedChange(e.target.value)}
              placeholder={name}
              autoComplete="off"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading || typed.trim() !== name} className={destructiveAction}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useRemoveFlow({ onChanged, onError }) {
  const [owned, setOwned] = useState([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);

  async function open() {
    setSelectedId('');
    setPickOpen(true);
    try {
      const all = await listBusinesses();
      setOwned(all.items.filter((b) => b.is_owner));
    } catch (err) {
      onError(errorText(err, 'Failed to load businesses'));
    }
  }

  async function confirm() {
    try {
      setLoading(true);
      await deleteBusiness(selectedId);
      onChanged();
    } catch (err) {
      onError(errorText(err, 'Failed to remove business'));
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  const dialogs = (
    <>
      <RemoveBusinessDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        businesses={owned}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onContinue={() => { setPickOpen(false); setConfirmOpen(true); }}
      />
      <ConfirmRemoveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        name={owned.find((b) => b.id === selectedId)?.name}
        loading={loading}
        onConfirm={confirm}
      />
    </>
  );
  return { open, dialogs };
}

function useTrashFlow({ onChanged, onError }) {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [purge, setPurge] = useState({ open: false, biz: null, typed: '', loading: false, exporting: false });

  async function refresh() {
    const data = await listDeletedBusinesses();
    setDeleted(data.items);
  }

  async function openTrash() {
    setOpen(true);
    setDeleted([]);
    setLoading(true);
    try {
      await refresh();
    } catch {
      setDeleted([]);
    } finally {
      setLoading(false);
    }
  }

  async function restore(id) {
    try {
      setRestoringId(id);
      await restoreBusiness(id);
      await refresh();
      onChanged();
    } catch (err) {
      onError(errorText(err, 'Failed to restore business'));
    } finally {
      setRestoringId(null);
    }
  }

  async function exportBackup() {
    try {
      setPurge((p) => ({ ...p, exporting: true }));
      downloadJson(await exportBusiness(purge.biz.id), `${purge.biz.name}-backup.json`);
    } catch (err) {
      onError(errorText(err, 'Failed to export business'));
    } finally {
      setPurge((p) => ({ ...p, exporting: false }));
    }
  }

  async function confirmPurge() {
    try {
      setPurge((p) => ({ ...p, loading: true }));
      await permanentDeleteBusiness(purge.biz.id, purge.typed);
      await refresh();
    } catch (err) {
      onError(errorText(err, 'Failed to permanently delete business'));
    } finally {
      setPurge((p) => ({ ...p, open: false, loading: false }));
    }
  }

  const dialogs = (
    <>
      <TrashDialog
        open={open}
        onOpenChange={setOpen}
        loading={loading}
        businesses={deleted}
        restoringId={restoringId}
        onRestore={restore}
        onPurge={(biz) => setPurge({ open: true, biz, typed: '', loading: false, exporting: false })}
      />
      <PermanentDeleteDialog
        open={purge.open}
        onOpenChange={(next) => setPurge((p) => ({ ...p, open: next }))}
        name={purge.biz?.name ?? ''}
        typed={purge.typed}
        onTypedChange={(typed) => setPurge((p) => ({ ...p, typed }))}
        loading={purge.loading}
        exporting={purge.exporting}
        onExport={exportBackup}
        onConfirm={confirmPurge}
      />
    </>
  );
  return { open: openTrash, dialogs };
}

// The More menu items and their dialogs. onChanged: the active list changed (removed or restored).
export function useBusinessTrash({ onChanged, onError }) {
  const remove = useRemoveFlow({ onChanged, onError });
  const trash = useTrashFlow({ onChanged, onError });
  return {
    menuItems: [
      { label: COPY.deletedBusinesses, icon: ArchiveRestore, onSelect: trash.open },
      { label: COPY.removeBusiness, icon: Trash2, onSelect: remove.open, destructive: true, separatorBefore: true },
    ],
    dialogs: <>{remove.dialogs}{trash.dialogs}</>,
  };
}
