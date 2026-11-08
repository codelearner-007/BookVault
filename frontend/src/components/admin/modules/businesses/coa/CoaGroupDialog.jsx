'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GroupSelect from './GroupSelect';
import { subtreeIds } from './coa-tree';

function Required() {
  return <span className="text-bad" aria-hidden="true">*</span>;
}

// Mounted only while open (keyed by the group), so its state starts fresh each time.
// group: the group being edited, or null for a new one. Root groups can only be renamed.
export default function CoaGroupDialog({ group, entries, defaultParentId, onClose, onSave }) {
  const isRoot = Boolean(group?.root_key);
  const [name, setName] = useState(group?.name ?? '');
  const [parentId, setParentId] = useState(group?.parent_group_id ?? defaultParentId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // A group cannot move under itself or one of its own sub-groups.
  const excluded = group ? subtreeIds(group) : new Set();
  const parentOptions = entries.filter((entry) => !excluded.has(entry.group.id));

  async function handleSave() {
    if (!name.trim()) return setError('Group name is required.');
    if (!isRoot && !parentId) return setError('Choose the group it belongs to.');
    setSaving(true);
    setError(null);
    try {
      await onSave(isRoot ? { name: name.trim() } : { name: name.trim(), parent_group_id: parentId });
      onClose();
    } catch (err) {
      setError(err?.message ?? 'Failed to save group.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="md:max-w-sm">
        <DialogHeader>
          <DialogTitle>{group ? 'Edit Group' : 'New Group'}</DialogTitle>
          {isRoot && <DialogDescription>This is a fixed root group: it can be renamed only.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name <Required /></Label>
            <Input
              id="group-name"
              placeholder="e.g. Fixed Assets"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={saving}
              autoFocus
            />
          </div>
          {!isRoot && (
            <div className="space-y-2">
              <Label htmlFor="group-parent">Group <Required /></Label>
              <GroupSelect id="group-parent" entries={parentOptions} value={parentId} onChange={setParentId} disabled={saving} />
            </div>
          )}
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
