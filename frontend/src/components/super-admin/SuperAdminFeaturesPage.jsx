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
import { LayoutGrid, Plus, X, GripVertical, Loader2, Pencil, Check, ArrowUpDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { listAdminTabs, updateAdminTabs, deleteAdminTab } from '@/lib/services/business.service';

/* ── Toggle ─────────────────────────────────────────────── */
function Toggle({ enabled, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={disabled ? undefined : onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-300 ease-in-out ${
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
    const oldIdx = order.findIndex(t => t.key === active.id);
    const newIdx = order.findIndex(t => t.key === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <Card
        className="relative z-10 w-full max-w-sm border-border shadow-2xl"
        onClick={e => e.stopPropagation()}
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
            <SortableContext
              items={order.map(t => t.key)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {order.map(tab => (
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
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving} className="cursor-pointer">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab row ─────────────────────────────────────────────── */
function TabRow({ tab, onToggle, onLabelSave, onDelete, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);

  function startEdit() {
    if (disabled) return;
    setDraft(tab.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.label) onLabelSave(trimmed);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setDraft(tab.label); }
  }

  if (confirmDelete) {
    return (
      <li className="flex items-center gap-3 px-4 py-3 bg-destructive/5 border-l-2 border-destructive">
        <span className="text-sm text-destructive flex-1 truncate">
          Delete <span className="font-medium">{tab.label}</span>?
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onDelete()}
            className="text-xs font-medium text-destructive hover:text-destructive/80 cursor-pointer"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3.5 group/row">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm px-2 py-0"
          />
        ) : (
          <span className="text-sm text-foreground truncate">{tab.label}</span>
        )}
        {!editing && !disabled && (
          <div className="flex items-center gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit label"
              className="text-muted-foreground hover:text-primary cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete tab"
              className="text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {editing && (
          <button
            type="button"
            onClick={commitEdit}
            aria-label="Confirm"
            className="flex-shrink-0 text-primary cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <Toggle
          enabled={tab.enabled}
          onChange={onToggle}
          label={`Enable ${tab.label}`}
          disabled={disabled}
        />
      </div>
    </li>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function SuperAdminFeaturesPage() {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchTabs(); }, []);

  async function fetchTabs() {
    setLoading(true);
    try {
      const data = await listAdminTabs();
      setTabs(data.items || []);
    } catch {
      setError('Failed to load features.');
    } finally {
      setLoading(false);
    }
  }

  /* Toggle on/off — optimistic, no re-fetch */
  async function toggleEnabled(idx) {
    if (toggling) return;
    const next = tabs.map((t, i) => i === idx ? { ...t, enabled: !t.enabled } : t);
    setTabs(next); // optimistic
    setToggling(true);
    try {
      await updateAdminTabs(next.map(t => ({ key: t.key, label: t.label, enabled: t.enabled })));
    } catch {
      setTabs(tabs); // rollback
      setError('Failed to save. Please try again.');
    } finally {
      setToggling(false);
    }
  }

  /* Label edit — optimistic, no re-fetch */
  async function saveLabel(idx, val) {
    if (toggling) return;
    const next = tabs.map((t, i) => i === idx ? { ...t, label: val } : t);
    setTabs(next);
    try {
      await updateAdminTabs(next.map(t => ({ key: t.key, label: t.label, enabled: t.enabled })));
    } catch {
      setTabs(tabs);
      setError('Failed to save label.');
    }
  }

  /* Reorder save — single API call, then re-fetch */
  async function handleReorderSave(ordered) {
    setReorderSaving(true);
    try {
      await updateAdminTabs(ordered.map(t => ({ key: t.key, label: t.label, enabled: t.enabled })));
      const data = await listAdminTabs();
      setTabs(data.items || []);
      setShowReorder(false);
    } catch {
      setError('Failed to save order.');
    } finally {
      setReorderSaving(false);
    }
  }

  /* Add tab */
  async function handleAddTab() {
    const label = newLabel.trim();
    if (!label) { setAddError('Tab name is required.'); return; }
    const key = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (tabs.some(t => t.key === key)) { setAddError('A tab with this name already exists.'); return; }

    setAdding(true);
    const next = [...tabs, { id: null, key, label, enabled: true, order_index: tabs.length }];
    try {
      await updateAdminTabs(next.map(t => ({ key: t.key, label: t.label, enabled: t.enabled })));
      const data = await listAdminTabs();
      setTabs(data.items || []);
      setNewLabel('');
      setAddError(null);
      setShowAddForm(false);
    } catch {
      setError('Failed to add tab.');
    } finally {
      setAdding(false);
    }
  }

  /* Delete tab */
  async function handleDeleteTab(key) {
    try {
      await deleteAdminTab(key);
      setTabs(prev => prev.filter(t => t.key !== key));
    } catch {
      setError('Failed to delete tab.');
    }
  }

  function openAddForm() {
    setShowAddForm(true);
    setNewLabel('');
    setAddError(null);
  }

  function closeAddForm() { setShowAddForm(false); setAddError(null); }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
                <Skeleton className="h-4 w-40 rounded" />
                <div className="flex-1" />
                <Skeleton className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Reorder modal */}
      {showReorder && (
        <ReorderModal
          tabs={tabs}
          onSave={handleReorderSave}
          onClose={() => !reorderSaving && setShowReorder(false)}
          saving={reorderSaving}
        />
      )}

      {/* Add tab modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" onClick={closeAddForm}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <Card className="relative z-10 w-full max-w-xs border-border shadow-2xl" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">New Tab</p>
                <button type="button" onClick={closeAddForm} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setAddError(null); }}
                onKeyDown={e => e.key === 'Enter' && handleAddTab()}
                placeholder="Tab name"
                className="h-8 text-sm"
                autoFocus
              />
              {addError && <p className="text-xs text-destructive">{addError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddTab} disabled={adding} className="cursor-pointer h-7 text-xs px-3">
                  {adding && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  {adding ? 'Adding...' : 'Add'}
                </Button>
                <Button size="sm" variant="ghost" onClick={closeAddForm} className="cursor-pointer h-7 text-xs px-3">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Features</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage global tab availability for all businesses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tabs.length > 1 && (
              <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer text-muted-foreground" onClick={() => setShowReorder(true)}>
                <ArrowUpDown className="h-3.5 w-3.5" />
                Reorder
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={openAddForm}>
              <Plus className="h-3.5 w-3.5" />
              Add Tab
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {tabs.length === 0 ? (
          <Card className="border-border shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="p-3 rounded-full bg-muted">
                <LayoutGrid className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No features yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Add tabs to make them available for businesses to use.
              </p>
              <Button size="sm" className="gap-1.5 cursor-pointer mt-1" onClick={openAddForm}>
                <Plus className="h-3.5 w-3.5" />
                Add Tab
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border shadow-sm overflow-hidden">
            <ul className="divide-y divide-border">
              {tabs.map((tab, idx) => (
                <TabRow
                  key={tab.key}
                  tab={tab}
                  idx={idx}
                  onToggle={() => toggleEnabled(idx)}
                  onLabelSave={val => saveLabel(idx, val)}
                  onDelete={() => handleDeleteTab(tab.key)}
                  disabled={toggling}
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
