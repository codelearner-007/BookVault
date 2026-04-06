'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Sliders, GripVertical, Loader2, ArrowUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { updateBusinessTabs } from '@/lib/services/business.service';

/* ── Toggle ─────────────────────────────────────────────── */
function Toggle({ enabled, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={disabled ? undefined : onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ── Sortable row inside reorder modal ───────────────────── */
function SortableItem({ tab }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.key });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-lg select-none ${
        isDragging ? 'shadow-lg opacity-90 z-10' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm text-foreground flex-1 truncate">{tab.label}</span>
    </li>
  );
}

/* ── Reorder modal ───────────────────────────────────────── */
function ReorderModal({ tabs, onSave, onClose, saving }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <Card
        className="relative z-10 w-full max-w-sm border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Reorder Tabs</p>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order.map((t) => t.key)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {order.map((tab) => (
                  <SortableItem key={tab.key} tab={tab} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => onSave(order)}
              disabled={saving}
              className="cursor-pointer"
            >
              {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              {saving ? 'Saving...' : 'Save Order'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function BusinessCustomize({ business, tabs, setTabs, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showReorder, setShowReorder] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);

  // Track the last-saved state to detect unsaved changes
  const savedRef = useRef(tabs.map((t) => ({ key: t.key, enabled: t.enabled })));
  const [isDirty, setIsDirty] = useState(false);

  // Re-sync savedRef whenever tabs are externally refreshed (on mount only)
  useEffect(() => {
    savedRef.current = tabs.map((t) => ({ key: t.key, enabled: t.enabled }));
    setIsDirty(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <>
      {showReorder && (
        <ReorderModal
          tabs={tabs}
          onSave={handleReorderSave}
          onClose={() => !reorderSaving && setShowReorder(false)}
          saving={reorderSaving}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Customize</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Toggle tabs on or off for {business.name}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tabs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 cursor-pointer text-muted-foreground"
                onClick={() => setShowReorder(true)}
                disabled={saving}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Reorder
              </Button>
            )}
            {isDirty && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="cursor-pointer"
              >
                {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card className="border-border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <div className="p-3 rounded-full bg-muted">
                  <Sliders className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No tabs available</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  The super admin has not enabled any tabs globally yet.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {tabs.map((tab) => (
                  <li key={tab.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="text-sm text-foreground">{tab.label}</span>
                    <Toggle
                      enabled={tab.enabled}
                      onChange={() => toggleTab(tab.key)}
                      label={`Enable ${tab.label}`}
                      disabled={saving}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
