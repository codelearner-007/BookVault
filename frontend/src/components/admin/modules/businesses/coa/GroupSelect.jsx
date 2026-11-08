'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ITEM_BASE_INDENT_REM = 2; // SelectItem's own ps-8 (room for the check mark)

// A group picker; entries come from flattenGroups() and nest by depth.
export default function GroupSelect({ id, entries, value, onChange, disabled }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select a group…" />
      </SelectTrigger>
      <SelectContent>
        {entries.map(({ group, depth }) => (
          <SelectItem key={group.id} value={group.id} style={{ paddingInlineStart: `${ITEM_BASE_INDENT_REM + depth}rem` }}>
            {group.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
