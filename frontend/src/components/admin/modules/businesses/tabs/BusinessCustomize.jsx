'use client';

import { useState, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sliders, GripVertical, Loader2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { updateBusinessTabs } from '@/lib/services/business.service';

/* ── Sortable row inside reorder dialog ──────────────────── */
function SortableItem({ tab }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.key });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex select-none items-center gap-2 rounded-control border border-border bg-popover pe-4 ps-1 ${
        isDragging ? 'z-10 shadow-pop' : ''
      }`}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Drag to reorder ${tab.label}`}
      >
        <GripVertical />
      </Button>
      <span className="min-w-0 flex-1 truncate py-2.5">{tab.label}</span>
    </li>
  );
}

/* ── Reorder dialog ──────────────────────────────────────── */
function ReorderDialog({ tabs, onSave, onClose, saving }) {
  const [order, setOrder] = useState(tabs);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((t) => t.key === active.id);
    const newIdx = order.findIndex((t) => t.key === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reorder tabs</DialogTitle>
          <DialogDescription>Drag tabs into the order they should appear in the sidebar.</DialogDescription>
        </DialogHeader>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((t) => t.key)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {order.map((tab) => (
                <SortableItem key={tab.key} tab={tab} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(order)} disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {saving ? 'Saving...' : 'Save Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function BusinessCustomize({ business, tabs, setTabs, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showReorder, setShowReorder] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);

  // The last-saved state, to detect unsaved changes (captured when the page opens)
  const savedRef = useRef(tabs.map((t) => ({ key: t.key, enabled: t.enabled })));
  const [isDirty, setIsDirty] = useState(false);

  function toggleTab(key) {
    setTabs((prev) => {
      const next = prev.map((t) => (t.key === key ? { ...t, enabled: !t.enabled } : t));
      const dirty = next.some((t) => {
        const saved = savedRef.current.find((s) => s.key === t.key);
        return !saved || saved.enabled !== t.enabled;
      });
      setIsDirty(dirty);
      return next;
    });
    if (error) setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const data = await updateBusinessTabs(
        business.id,
        tabs.map((t) => ({ key: t.key, enabled: t.enabled }))
      );
      const saved = data.items || [];
      savedRef.current = saved.map((t) => ({ key: t.key, enabled: t.enabled }));
      setIsDirty(false);
      onSaved(saved);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReorderSave(ordered) {
    setReorderSaving(true);
    try {
      const data = await updateBusinessTabs(
        business.id,
        ordered.map((t) => ({ key: t.key, enabled: t.enabled }))
      );
      const saved = data.items || [];
      savedRef.current = saved.map((t) => ({ key: t.key, enabled: t.enabled }));
      setTabs(saved);
      setIsDirty(false);
      onSaved(saved);
      setShowReorder(false);
    } catch {
      setError('Failed to save order.');
    } finally {
      setReorderSaving(false);
    }
  }

  const headerActions = (
    <>
      {tabs.length > 1 && (
        <Button variant="ghost" onClick={() => setShowReorder(true)} disabled={saving}>
          <ArrowUpDown />
          Reorder
        </Button>
      )}
      {isDirty && (
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      )}
    </>
  );

  return (
    <>
      {showReorder && (
        <ReorderDialog
          tabs={tabs}
          onSave={handleReorderSave}
          onClose={() => !reorderSaving && setShowReorder(false)}
          saving={reorderSaving}
        />
      )}

      <PageHeader
        title="Customize tabs"
        description={`Toggle tabs on or off for ${business.name}.`}
        actions={headerActions}
      />

      {error && <p className="mb-4 text-sm text-bad" role="alert">{error}</p>}

      <ListCard className="max-w-prose">
        {tabs.length === 0 ? (
          <EmptyState
            icon={Sliders}
            title="No tabs available"
            description="The super admin has not enabled any tabs globally yet."
          />
        ) : (
          <ul>
            {tabs.map((tab) => (
              <li
                key={tab.key}
                className="flex min-h-row items-center justify-between gap-4 border-b border-row-divider px-4 last:border-b-0"
              >
                <span>{tab.label}</span>
                <Switch
                  checked={tab.enabled}
                  onCheckedChange={() => toggleTab(tab.key)}
                  aria-label={`Enable ${tab.label}`}
                  disabled={saving}
                />
              </li>
            ))}
          </ul>
        )}
      </ListCard>
    </>
  );
}
