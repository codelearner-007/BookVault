'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Trash2, Plus, RotateCcw, ArchiveRestore, Loader2, ChevronRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader, MoreMenu, ListCard, EmptyState } from '@/components/common/page';
import {
  listBusinesses,
  createBusiness,
  deleteBusiness,
  listDeletedBusinesses,
  restoreBusiness,
  permanentDeleteBusiness,
  exportBusiness,
} from '@/lib/services/business.service';

const CREATE_PARAM = 'create';
const SKELETON_ROWS = 3;
const destructiveAction = buttonVariants({ variant: 'destructive' });

function bizId(biz) {
  return biz.id ?? biz._id;
}

function BusinessAvatar({ name }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-9 shrink-0 place-items-center rounded-menu-item bg-mono text-sm font-bold text-mono-foreground select-none"
    >
      {name ? name.charAt(0).toUpperCase() : '?'}
    </span>
  );
}

function BusinessIdentity({ biz }) {
  return (
    <>
      <BusinessAvatar name={biz.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{biz.name}</p>
        {biz.country && <p className="mt-0.5 truncate text-sm text-muted-foreground">{biz.country}</p>}
      </div>
    </>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-9 shrink-0 rounded-menu-item" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-pill w-16 shrink-0 rounded-full" />
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} />);
}

/* ── Business list ───────────────────────────────────────────────────────── */

function BusinessList({ businesses, loading, onCreate }) {
  if (loading) return <SkeletonRows />;
  if (businesses.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No businesses yet"
        description="Create your first business to get started managing accounts and settings."
        action={<Button onClick={onCreate}><Plus />Create business</Button>}
      />
    );
  }
  return (
    <ul aria-label="Businesses" className="divide-y divide-row-divider">
      {businesses.map((biz) => (
        <li key={bizId(biz)}>
          <Link
            href={`/admin/businesses/${bizId(biz)}?tab=summary`}
            className="flex items-center gap-3 rounded-control px-4 py-3 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BusinessIdentity biz={biz} />
            <Badge variant="role">{biz.is_owner ? 'Owner' : 'Member'}</Badge>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ── Create dialog ───────────────────────────────────────────────────────── */

function CreateBusinessDialog({ open, onOpenChange, form, setForm, error, loading, onCreate }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create business</DialogTitle>
          <DialogDescription>
            Create a new business workspace. You can configure details and settings after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="biz-name">
              Business Name <span className="text-bad" aria-hidden="true">*</span>
            </Label>
            <Input
              id="biz-name"
              placeholder="e.g. Acme Corp"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
              disabled={loading}
              autoFocus
              aria-required="true"
              aria-invalid={Boolean(error && !form.name.trim())}
              aria-describedby={error ? 'biz-name-error' : undefined}
            />
            {error && <p id="biz-name-error" className="text-sm text-bad" role="alert">{error}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="biz-country">
              Country <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="biz-country"
              placeholder="e.g. United States"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onCreate} disabled={loading} className="min-w-20">
            {loading ? <><Loader2 className="animate-spin" />Creating…</> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Remove flow (pick, then confirm) ────────────────────────────────────── */

function RemoveBusinessDialog({ open, onOpenChange, businesses, selectedId, onSelect, onContinue }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Business</DialogTitle>
          <DialogDescription>Select the business you want to remove.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="remove-select">Business</Label>
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger id="remove-select" className="w-full">
              <SelectValue placeholder="Select a business…" />
            </SelectTrigger>
            <SelectContent>
              {businesses.map((biz) => (
                <SelectItem key={bizId(biz)} value={bizId(biz)}>
                  {biz.name}{biz.country ? ` — ${biz.country}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onContinue} disabled={!selectedId}>
            Remove Business
          </Button>
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
          <AlertDialogTitle>Delete &quot;{name ?? 'this business'}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This business will be moved to Trash. You can restore it later from the Trash panel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading} className={`${destructiveAction} min-w-20`}>
            {loading ? <><Loader2 className="animate-spin" />Deleting…</> : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Trash ───────────────────────────────────────────────────────────────── */

function DeletedBusinessRow({ biz, restoring, onRestore, onPurge }) {
  return (
    <li className="flex items-center gap-3 rounded-control px-4 py-3 transition-colors duration-150 hover:bg-row-hover">
      <BusinessIdentity biz={biz} />
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onRestore} disabled={restoring} aria-label={`Restore ${biz.name}`}>
          {restoring ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPurge}
          className="hover:text-bad"
          aria-label={`Permanently delete ${biz.name}`}
        >
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
          <DialogTitle>Deleted Businesses</DialogTitle>
          <DialogDescription>Businesses can be restored within this panel.</DialogDescription>
        </DialogHeader>

        <div className="-mx-2 max-h-72 overflow-y-auto">
          {loading && <SkeletonRows />}
          {!loading && businesses.length === 0 && (
            <EmptyState icon={Building2} title="No deleted businesses" className="py-8" />
          )}
          {!loading && businesses.length > 0 && (
            <ul className="divide-y divide-row-divider">
              {businesses.map((biz) => (
                <DeletedBusinessRow
                  key={bizId(biz)}
                  biz={biz}
                  restoring={restoringId === bizId(biz)}
                  onRestore={() => onRestore(bizId(biz))}
                  onPurge={() => onPurge(biz)}
                />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
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
          <AlertDialogTitle>Permanently Delete Business?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-semibold text-foreground">{name}</span> will be{' '}
            <span className="font-semibold text-bad">permanently deleted</span> and cannot be recovered. This action is irreversible.
            {' '}You may be asked to sign in again first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4">
          <Button variant="secondary" onClick={onExport} disabled={exporting} className="w-full">
            {exporting ? 'Preparing backup...' : 'Download a full backup'}
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
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading || typed.trim() !== name}
            className={destructiveAction}
          >
            {loading ? 'Deleting...' : 'Delete Permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

const EMPTY_ADD_FORM = { name: '', country: '' };

export default function BusinessesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createFromUrl = searchParams.get(CREATE_PARAM) === '1';

  // Active businesses list
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add business dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState(null);

  // Remove dialog (flow 1)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeSelectedId, setRemoveSelectedId] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Trash dialog (flow 2)
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [deletedBusinesses, setDeletedBusinesses] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoreLoadingId, setRestoreLoadingId] = useState(null);

  // Permanent delete (from trash dialog)
  const [permanentDeleteId, setPermanentDeleteId] = useState(null);
  const [permanentDeleteName, setPermanentDeleteName] = useState('');
  const [permanentDeleteLoading, setPermanentDeleteLoading] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentDeleteTyped, setPermanentDeleteTyped] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const loadBusinesses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listBusinesses();
      setBusinesses(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  // ── Add Business ──────────────────────────────────────────────────────────

  // The business switcher opens this dialog with ?create=1; closing it drops the param.
  function handleAddOpenChange(open) {
    setAddOpen(open);
    if (open) return;
    setAddForm(EMPTY_ADD_FORM);
    setAddError(null);
    if (!createFromUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(CREATE_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function handleCreateBusiness() {
    if (!addForm.name.trim()) {
      setAddError('Business name is required');
      return;
    }
    try {
      setAddLoading(true);
      setAddError(null);
      const payload = { name: addForm.name.trim() };
      if (addForm.country.trim()) payload.country = addForm.country.trim();
      await createBusiness(payload);
      handleAddOpenChange(false);
      await loadBusinesses();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create business');
    } finally {
      setAddLoading(false);
    }
  }

  function handleAddFormChange(next) {
    setAddForm(next);
    if (addError) setAddError(null);
  }

  // ── Remove Dialog (flow 1) ────────────────────────────────────────────────

  function handleOpenRemoveDialog() {
    setRemoveSelectedId('');
    setRemoveDialogOpen(true);
  }

  function handleOpenConfirmDelete() {
    setRemoveDialogOpen(false);
    setConfirmDeleteOpen(true);
  }

  async function handleConfirmDelete() {
    try {
      setDeleteLoading(true);
      await deleteBusiness(removeSelectedId);
      setConfirmDeleteOpen(false);
      setRemoveSelectedId('');
      await loadBusinesses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete business');
      setConfirmDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Trash Dialog (flow 2) ─────────────────────────────────────────────────

  async function handleOpenTrashDialog() {
    setTrashDialogOpen(true);
    setDeletedBusinesses([]);
    try {
      setTrashLoading(true);
      const data = await listDeletedBusinesses();
      setDeletedBusinesses(data.items);
    } catch {
      setDeletedBusinesses([]);
    } finally {
      setTrashLoading(false);
    }
  }

  function handleOpenPermanentDelete(biz) {
    setPermanentDeleteId(bizId(biz));
    setPermanentDeleteName(biz.name);
    setPermanentDeleteTyped('');
    setPermanentDeleteOpen(true);
  }

  async function handlePermanentDelete() {
    try {
      setPermanentDeleteLoading(true);
      await permanentDeleteBusiness(permanentDeleteId, permanentDeleteTyped);
      setPermanentDeleteOpen(false);
      setPermanentDeleteId(null);
      setPermanentDeleteName('');
      const deletedData = await listDeletedBusinesses();
      setDeletedBusinesses(deletedData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete business');
      setPermanentDeleteOpen(false);
    } finally {
      setPermanentDeleteLoading(false);
    }
  }

  async function handleExportBackup() {
    try {
      setExportLoading(true);
      const backup = await exportBusiness(permanentDeleteId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${permanentDeleteName}-backup.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export business');
    } finally {
      setExportLoading(false);
    }
  }

  async function handleRestore(id) {
    try {
      setRestoreLoadingId(id);
      await restoreBusiness(id);
      const [activeData, deletedData] = await Promise.all([
        listBusinesses(),
        listDeletedBusinesses(),
      ]);
      setBusinesses(activeData.items);
      setDeletedBusinesses(deletedData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore business');
    } finally {
      setRestoreLoadingId(null);
    }
  }

  const removeSelectedBiz = businesses.find((b) => bizId(b) === removeSelectedId);

  return (
    <div>
      <PageHeader
        title="Businesses"
        actions={(
          <>
            <MoreMenu
              items={[
                { label: 'Deleted Businesses', icon: ArchiveRestore, onSelect: handleOpenTrashDialog },
                { label: 'Remove Business', icon: Trash2, onSelect: handleOpenRemoveDialog, destructive: true, separatorBefore: true },
              ]}
            />
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              Create business
            </Button>
          </>
        )}
      />

      {error && (
        <p className="mb-4 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">{error}</p>
      )}

      <ListCard>
        <BusinessList businesses={businesses} loading={loading} onCreate={() => setAddOpen(true)} />
      </ListCard>

      <CreateBusinessDialog
        open={addOpen || createFromUrl}
        onOpenChange={handleAddOpenChange}
        form={addForm}
        setForm={handleAddFormChange}
        error={addError}
        loading={addLoading}
        onCreate={handleCreateBusiness}
      />
      <RemoveBusinessDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        businesses={businesses}
        selectedId={removeSelectedId}
        onSelect={setRemoveSelectedId}
        onContinue={handleOpenConfirmDelete}
      />
      <ConfirmRemoveDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        name={removeSelectedBiz?.name}
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
      />
      <TrashDialog
        open={trashDialogOpen}
        onOpenChange={setTrashDialogOpen}
        loading={trashLoading}
        businesses={deletedBusinesses}
        restoringId={restoreLoadingId}
        onRestore={handleRestore}
        onPurge={handleOpenPermanentDelete}
      />
      <PermanentDeleteDialog
        open={permanentDeleteOpen}
        onOpenChange={setPermanentDeleteOpen}
        name={permanentDeleteName}
        typed={permanentDeleteTyped}
        onTypedChange={setPermanentDeleteTyped}
        loading={permanentDeleteLoading}
        exporting={exportLoading}
        onExport={handleExportBackup}
        onConfirm={handlePermanentDelete}
      />
    </div>
  );
}
