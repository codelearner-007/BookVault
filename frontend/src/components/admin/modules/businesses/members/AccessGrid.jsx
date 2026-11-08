'use client';

import { useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AREA_RIGHTS, RIGHT_VIEW } from '@/lib/constants/access-rights';
import { MEMBERS_COPY as COPY } from '@/lib/copy/members';
import { presetGrid, toggleRight } from './access-grid';

function RightCell({ row, right, checked, disabled, onToggle }) {
  if (row.is_view_only && right !== RIGHT_VIEW) {
    return <TableCell className="text-center" aria-hidden="true" />;
  }
  return (
    <TableCell className="px-0 text-center">
      <Label className="inline-flex size-control cursor-pointer items-center justify-center rounded-control hover:bg-row-hover">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onToggle(row, right, value === true)}
          aria-label={COPY.rightLabel(COPY.rights[right], row.label)}
        />
      </Label>
    </TableCell>
  );
}

function PresetPicker({ presets, rows, disabled, onApply }) {
  const [value, setValue] = useState('');
  if (presets.length === 0) return null;
  const apply = (key) => {
    const preset = presets.find((p) => p.key === key);
    if (preset) onApply(presetGrid(preset, rows));
    setValue('');
  };
  return (
    <Select value={value} onValueChange={apply} disabled={disabled}>
      <SelectTrigger className="w-full md:w-56" aria-label={COPY.presets}>
        <SelectValue placeholder={COPY.presets} />
      </SelectTrigger>
      <SelectContent>
        {presets.map((preset) => (
          <SelectItem key={preset.key} value={preset.key}>{preset.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GridTable({ rows, grid, disabled, failed, onToggle }) {
  if (failed || rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{failed ? COPY.areasFailed : COPY.noAreas}</p>;
  }
  return (
    <Table cards={false}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{COPY.tab}</TableHead>
          {AREA_RIGHTS.map((right) => (
            <TableHead key={right} className="w-0 px-1 text-center md:px-3">{COPY.rights[right]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="py-2 pe-2 max-md:ps-3">
              <span className="block font-medium">{row.label}</span>
              {row.is_view_only && <span className="block text-sm text-muted-foreground">{COPY.viewOnly}</span>}
            </TableCell>
            {AREA_RIGHTS.map((right) => (
              <RightCell
                key={right}
                row={row}
                right={right}
                checked={(grid[row.key] ?? []).includes(right)}
                disabled={disabled}
                onToggle={onToggle}
              />
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Full access switch, or a custom grid of tabs x View/Create/Edit/Delete with presets that only tick boxes.
 * Controlled: value = { fullAccess, grid }, onChange(next).
 */
export default function AccessGrid({ rows, presets, failed, value, onChange, disabled }) {
  const switchId = useId();
  const { fullAccess, grid } = value;
  const ticked = Object.values(grid).some((rights) => rights.length > 0);
  const setGrid = (next) => onChange({ fullAccess, grid: next });
  const onToggle = (row, right, checked) => setGrid(toggleRight(grid, row, right, checked));

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={switchId} className="text-base font-semibold">{COPY.fullAccess}</Label>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.fullAccessHint}</p>
        </div>
        <Switch
          id={switchId}
          checked={fullAccess}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ fullAccess: checked, grid })}
          className="mt-0.5"
        />
      </div>

      {!fullAccess && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PresetPicker presets={presets} rows={rows} disabled={disabled} onApply={setGrid} />
            {ticked && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setGrid({})} disabled={disabled}>
                {COPY.clearAll}
              </Button>
            )}
          </div>
          <div className="rounded-card border border-card-border">
            <GridTable rows={rows} grid={grid} disabled={disabled} failed={failed} onToggle={onToggle} />
          </div>
          <p className="text-sm text-muted-foreground">{ticked ? COPY.presetHint : COPY.noneGranted}</p>
        </>
      )}
    </div>
  );
}
