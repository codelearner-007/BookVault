'use client';

import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function SortableItem({ id, label }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

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
        aria-label={`Drag to reorder ${label}`}
      >
        <GripVertical />
      </Button>
      <span className="min-w-0 flex-1 break-words py-2.5">{label}</span>
    </li>
  );
}

// Drag-and-drop ordering of one parent's groups or one group's accounts.
export default function ReorderModal({ title, items, onSave, onClose, saving }) {
  const [order, setOrder] = useState(items);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((item) => item.id === active.id);
    const newIdx = order.findIndex((item) => item.id === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {order.map((item) => <SortableItem key={item.id} id={item.id} label={item.name} />)}
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
