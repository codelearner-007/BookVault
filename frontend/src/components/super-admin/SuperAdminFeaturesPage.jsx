'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpDown, Blocks, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, MoreMenu, PageHeader } from '@/components/common/page';
import { listAdminTabs, updateAdminTabs, deleteAdminTab } from '@/lib/services/business.service';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';
import { ConfirmDialog } from './platform-parts';

const COPY = SUPER_ADMIN_COPY.modules;
const SKELETON_ROWS = 8;
const DRAG_DISTANCE_PX = 4;

// PUT /admin-tabs replaces the catalog: send every field so defaults and parents survive.
function toUpsertItem(tab) {
  return {
    key: tab.key,
    label: tab.label,
    enabled: tab.enabled,
    default_enabled: tab.default_enabled ?? false,
    parent_key: tab.parent_key ?? null,
  };
}

function keyFromLabel(label) {
  return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function ModulesSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-control w-28 rounded-full" />
      </div>
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </div>
  );
}

// Add or rename: one name field. editing = { tab } to rename, {} to add, null when closed.
function NameDialog({ editing, tabs, busy, onSubmit, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const renaming = Boolean(editing?.tab);

  useEffect(() => {
    setName(editing?.tab?.label ?? '');
    setError(null);
  }, [editing]);

  function submit(event) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return setError(COPY.nameRequired);
    if (!renaming && tabs.some((t) => t.key === keyFromLabel(label))) return setError(COPY.nameTaken);
    return onSubmit(label);
  }

  return (
    <Dialog open={!!editing} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="md:max-w-sm">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{renaming ? COPY.renameTitle : COPY.addTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="tab-name">{COPY.nameLabel}</Label>
            <Input
              id="tab-name"
              value={name}
              onChange={(event) => { setName(event.target.value); setError(null); }}
              aria-invalid={!!error}
              aria-describedby={error ? 'tab-name-error' : undefined}
              autoFocus
            />
            {error && <p id="tab-name-error" className="text-sm text-bad">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{COPY.cancel}</Button>
            <Button type="submit" disabled={busy}>{busy ? COPY.saving : renaming ? COPY.save : COPY.add}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableItem({ tab }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-control border border-border bg-popover px-2 py-1.5 ${isDragging ? 'z-10 shadow-pop' : ''}`}
    >
      <Button variant="ghost" size="icon-sm" className="cursor-grab touch-none" aria-label={COPY.dragHandle(tab.label)} {...attributes} {...listeners}>
        <GripVertical aria-hidden="true" />
      </Button>
      <span className="truncate">{tab.label}</span>
    </li>
  );
}

function ReorderDialog({ open, tabs, busy, onSave, onClose }) {
  const [order, setOrder] = useState(tabs);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) setOrder(tabs);
  }, [open, tabs]);

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setOrder((prev) => arrayMove(prev, prev.findIndex((t) => t.key === active.id), prev.findIndex((t) => t.key === over.id)));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{COPY.reorderTitle}</DialogTitle>
          <DialogDescription>{COPY.reorderBody}</DialogDescription>
        </DialogHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((t) => t.key)} strategy={verticalListSortingStrategy}>
            <ul className="grid max-h-[60dvh] gap-1.5 overflow-y-auto">
              {order.map((tab) => <SortableItem key={tab.key} tab={tab} />)}
            </ul>
          </SortableContext>
        </DndContext>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{COPY.cancel}</Button>
          <Button onClick={() => onSave(order)} disabled={busy}>{busy ? COPY.saving : COPY.saveOrder}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabsTable({ tabs, disabled, onToggle, onRename, onRemove }) {
  const columns = COPY.columns;
  return (
    <Table aria-label={COPY.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{columns.tab}</TableHead>
          <TableHead>{columns.key}</TableHead>
          <TableHead className="w-24 text-end">{columns.offered}</TableHead>
          <TableHead className="w-12"><span className="sr-only">{SUPER_ADMIN_COPY.users.columns.actions}</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tabs.map((tab) => (
          <TableRow key={tab.key}>
            <TableCell data-card="title" className="font-medium">{tab.label}</TableCell>
            <TableCell data-card="meta" className="font-mono text-sm text-muted-foreground">{tab.key}</TableCell>
            <TableCell data-card="end" className="w-24 text-end">
              <Switch
                checked={tab.enabled}
                onCheckedChange={() => onToggle(tab)}
                disabled={disabled}
                aria-label={COPY.offered(tab.label)}
              />
            </TableCell>
            <TableCell data-card="actions" className="w-12 pe-2">
              <MoreMenu
                label={COPY.rowActions(tab.label)}
                items={[
                  { label: COPY.rename, icon: Pencil, onSelect: () => onRename(tab), disabled },
                  { label: COPY.remove, icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => onRemove(tab), disabled },
                ]}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SuperAdminFeaturesPage() {
  const [tabs, setTabs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [removing, setRemoving] = useState(null);

  async function reload() {
    try {
      setTabs((await listAdminTabs()).items);
    } catch {
      toast.error(COPY.loadFailed);
      setTabs((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // Optimistic catalog write; rolls back on failure.
  async function save(next, { refetch = false } = {}) {
    const previous = tabs;
    setTabs(next);
    setSaving(true);
    try {
      await updateAdminTabs(next.map(toUpsertItem));
      if (refetch) await reload();
      return true;
    } catch {
      setTabs(previous);
      toast.error(COPY.saveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitName(label) {
    const next = editing.tab
      ? tabs.map((t) => (t.key === editing.tab.key ? { ...t, label } : t))
      : [...tabs, { key: keyFromLabel(label), label, enabled: true }];
    if (await save(next, { refetch: !editing.tab })) setEditing(null);
  }

  async function saveOrder(ordered) {
    if (await save(ordered, { refetch: true })) setReordering(false);
  }

  async function remove() {
    setSaving(true);
    try {
      await deleteAdminTab(removing.key);
      setTabs((prev) => prev.filter((t) => t.key !== removing.key));
      setRemoving(null);
    } catch (err) {
      toast.error(err?.message || COPY.removeFailed);
    } finally {
      setSaving(false);
    }
  }

  if (!tabs) return <ModulesSkeleton />;

  const actions = (
    <>
      <MoreMenu items={[tabs.length > 1 && { label: COPY.reorder, icon: ArrowUpDown, onSelect: () => setReordering(true) }]} />
      <Button onClick={() => setEditing({})}>
        <Plus aria-hidden="true" />
        {COPY.addTab}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader title={COPY.title} description={COPY.description} actions={actions} />
      <ListCard>
        {tabs.length === 0 ? (
          <EmptyState icon={Blocks} title={COPY.empty} description={COPY.emptyBody} />
        ) : (
          <TabsTable
            tabs={tabs}
            disabled={saving}
            onToggle={(tab) => save(tabs.map((t) => (t.key === tab.key ? { ...t, enabled: !t.enabled } : t)))}
            onRename={(tab) => setEditing({ tab })}
            onRemove={setRemoving}
          />
        )}
      </ListCard>
      <NameDialog editing={editing} tabs={tabs} busy={saving} onSubmit={submitName} onClose={() => setEditing(null)} />
      <ReorderDialog open={reordering} tabs={tabs} busy={saving} onSave={saveOrder} onClose={() => setReordering(false)} />
      <ConfirmDialog
        confirm={removing && { title: COPY.removeTitle(removing.label), body: COPY.removeBody, action: COPY.remove, destructive: true }}
        busy={saving}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
        cancelLabel={COPY.cancel}
      />
    </>
  );
}
