'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

function SortableColRow({ col, onToggle, isLast }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex h-row items-center gap-3 px-2 select-none transition-colors ${isLast ? '' : 'border-b border-row-divider'} ${isDragging ? 'opacity-50 bg-row-selected' : 'hover:bg-row-hover'}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical />
      </Button>
      <Checkbox
        id={`col-editor-${col.key}`}
        checked={col.visible}
        onCheckedChange={() => !col.locked && onToggle(col.key)}
        disabled={col.locked}
        className="shrink-0"
      />
      <Label
        htmlFor={`col-editor-${col.key}`}
        className={`flex-1 text-base ${col.locked ? 'text-muted-foreground cursor-not-allowed' : ''}`}
      >
        {col.label}
      </Label>
      {col.locked && (
        <Lock className="me-2 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * ColEditorDialog — reusable drag-and-drop column visibility editor.
 *
 * Props:
 *   open         {boolean}
 *   onOpenChange {(open: boolean) => void}
 *   cols         {Array<{ key: string, label: string, visible: boolean, locked: boolean }>}
 *   onApply      {(newCols: typeof cols) => void}
 */
export default function ColEditorDialog({ open, onOpenChange, cols, onApply }) {
  const [draftCols, setDraftCols] = useState(cols);

  useEffect(() => {
    if (open) setDraftCols(cols);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftCols((prev) => {
        const oldIndex = prev.findIndex((c) => c.key === active.id);
        const newIndex = prev.findIndex((c) => c.key === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function toggleCol(key) {
    setDraftCols((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }

  function handleApply() {
    onApply(draftCols);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Columns</DialogTitle>
        </DialogHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftCols.map((c) => c.key)} strategy={verticalListSortingStrategy}>
            {draftCols.map((col, idx) => (
              <SortableColRow
                key={col.key}
                col={col}
                onToggle={toggleCol}
                isLast={idx === draftCols.length - 1}
              />
            ))}
          </SortableContext>
        </DndContext>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
