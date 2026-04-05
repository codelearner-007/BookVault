'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building2, HelpCircle, Trash2, Plus, RotateCcw, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  listBusinesses,
  createBusiness,
  deleteBusiness,
  listDeletedBusinesses,
  restoreBusiness,
  permanentDeleteBusiness,
} from '@/lib/services/business.service';
function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

function BusinessAvatar({ name }) {
  const letter = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className="h-9 w-9 rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0 select-none">
      <span className="text-sm font-semibold text-primary">{letter}</span>
    </div>
  );
}

function Spinner({ className = '' }) {
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin ${className}`}
      aria-hidden="true"
    />
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-3.5 w-20 flex-shrink-0" />
    </div>
  );
}

export default function BusinessesPage() {

  // Active businesses list
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add business dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCountry, setAddCountry] = useState('');
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

  const loadBusinesses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listBusinesses();
      setBusinesses(Array.isArray(data) ? data : (data?.items ?? []));
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

  function handleOpenAdd() {
    setAddName('');
    setAddCountry('');
    setAddError(null);
    setAddOpen(true);
  }

  async function handleCreateBusiness() {
    if (!addName.trim()) {
      setAddError('Business name is required');
      return;
    }
    try {
      setAddLoading(true);
      setAddError(null);
      const payload = { name: addName.trim() };
      if (addCountry.trim()) payload.country = addCountry.trim();
      await createBusiness(payload);
      setAddOpen(false);
      await loadBusinesses();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create business');
    } finally {
      setAddLoading(false);
    }
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
      setDeletedBusinesses(Array.isArray(data) ? data : (data?.items ?? []));
    } catch {
      setDeletedBusinesses([]);
    } finally {
      setTrashLoading(false);
    }
  }

  async function handlePermanentDelete() {
    try {
      setPermanentDeleteLoading(true);
      await permanentDeleteBusiness(permanentDeleteId);
      setPermanentDeleteOpen(false);
      setPermanentDeleteId(null);
      setPermanentDeleteName('');
      const deletedData = await listDeletedBusinesses();
      setDeletedBusinesses(
        Array.isArray(deletedData)
          ? deletedData
          : (deletedData?.items ?? deletedData?.businesses ?? [])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to permanently delete business');
      setPermanentDeleteOpen(false);
    } finally {
      setPermanentDeleteLoading(false);
    }
  }

  async function handleRestore(id) {
    try {
      setRestoreLoadingId(id);
      await restoreBusiness(id);
      // Reload both lists
      const [activeData, deletedData] = await Promise.all([
        listBusinesses(),
        listDeletedBusinesses(),
      ]);
      setBusinesses(
        Array.isArray(activeData)
          ? activeData
          : (activeData?.items ?? [])
      );
      setDeletedBusinesses(
        Array.isArray(deletedData)
          ? deletedData
          : (deletedData?.items ?? [])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore business');
    } finally {
      setRestoreLoadingId(null);
    }
  }

  const removeSelectedBiz = businesses.find((b) => (b.id ?? b._id) === removeSelectedId);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Businesses</h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Help: What are businesses?"
            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>

        {/* Action toolbar */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={handleOpenAdd}
            aria-label="Add a new business"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Business
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleOpenRemoveDialog}
            className="cursor-pointer"
          >
            Remove Business
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150 cursor-pointer"
            onClick={handleOpenTrashDialog}
            aria-label="View deleted businesses"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Page-level error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Business list card */}
      <Card className="border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Name
          </p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Created
          </p>
        </div>

        {loading ? (
          <div className="divide-y divide-border">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : businesses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="p-4 rounded-full bg-muted">
              <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No businesses yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Create your first business to get started managing accounts and settings.
              </p>
            </div>
            <Button size="sm" onClick={handleOpenAdd} className="gap-1.5 cursor-pointer">
              <Plus className="h-4 w-4" />
              Add Business
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border" role="list" aria-label="Businesses">
            {businesses.map((biz) => {
              const id = biz.id ?? biz._id;
              return (
                <div
                  key={id}
                  role="listitem"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors duration-150"
                >
                  <BusinessAvatar name={biz.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-tight">
                      {biz.name}
                    </p>
                    {biz.country && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{biz.country}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(biz.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Add Business Dialog ────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Business</DialogTitle>
            <DialogDescription>
              Create a new business workspace. You can configure details and settings after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">
                Business Name <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="biz-name"
                placeholder="e.g. Acme Corp"
                value={addName}
                onChange={(e) => {
                  setAddName(e.target.value);
                  if (addError) setAddError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBusiness()}
                disabled={addLoading}
                autoFocus
                aria-required="true"
                aria-describedby={addError ? 'biz-name-error' : undefined}
                className={addError && !addName.trim() ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
              {addError && (
                <p id="biz-name-error" className="text-xs text-destructive" role="alert">
                  {addError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-country">
                Country{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="biz-country"
                placeholder="e.g. United States"
                value={addCountry}
                onChange={(e) => setAddCountry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBusiness()}
                disabled={addLoading}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addLoading}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBusiness}
              disabled={addLoading}
              className="cursor-pointer min-w-[80px]"
            >
              {addLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Creating…
                </span>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Dialog (flow 1) ─────────────────────────────────────────── */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-semibold">Remove Business</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Select the business you want to remove.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="remove-select" className="text-sm font-medium">
              Business
            </Label>
            <Select value={removeSelectedId} onValueChange={setRemoveSelectedId}>
              <SelectTrigger id="remove-select" className="w-full h-10">
                <SelectValue placeholder="Select a business…" />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((biz) => {
                  const id = biz.id ?? biz._id;
                  return (
                    <SelectItem key={id} value={id}>
                      <div className="flex items-center gap-2.5 py-0.5">
                        <div className="h-6 w-6 rounded-full bg-primary/10 border border-border flex items-center justify-center flex-shrink-0 select-none">
                          <span className="text-[10px] font-semibold text-primary">
                            {biz.name ? biz.name.charAt(0).toUpperCase() : '?'}
                          </span>
                        </div>
                        <span className="text-sm">
                          {biz.name}{biz.country ? ` — ${biz.country}` : ''}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleOpenConfirmDelete}
              disabled={!removeSelectedId}
              className="cursor-pointer"
            >
              Remove Business
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete AlertDialog ─────────────────────────────────────── */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{removeSelectedBiz?.name ?? 'this business'}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This business will be moved to Trash. You can restore it later from the Trash panel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading} className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer min-w-[80px]"
            >
              {deleteLoading ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Deleting…
                </span>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Trash Dialog (flow 2) ──────────────────────────────────────────── */}
      <Dialog open={trashDialogOpen} onOpenChange={setTrashDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deleted Businesses</DialogTitle>
            <DialogDescription>
              Businesses can be restored within this panel.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto -mx-6 px-6 py-1">
            {trashLoading ? (
              <div className="space-y-0.5">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : deletedBusinesses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <div className="p-3 rounded-full bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted-foreground">No deleted businesses</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {deletedBusinesses.map((biz) => {
                  const id = biz.id ?? biz._id;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors duration-150"
                    >
                      <BusinessAvatar name={biz.name} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate leading-tight">
                          {biz.name}
                        </p>
                        {biz.country && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {biz.country}
                          </p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 cursor-pointer">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRestore(id)}
                            disabled={restoreLoadingId === id}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {restoreLoadingId === id ? 'Restoring...' : 'Restore'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setPermanentDeleteId(id);
                              setPermanentDeleteName(biz.name);
                              setPermanentDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrashDialogOpen(false)}
              className="cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Permanent Delete AlertDialog ───────────────────────────────────── */}
      <AlertDialog open={permanentDeleteOpen} onOpenChange={setPermanentDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete Business?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{permanentDeleteName}</span> will be{' '}
              <span className="font-semibold text-destructive">permanently deleted</span> and cannot be recovered. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={permanentDeleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={permanentDeleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {permanentDeleteLoading ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
