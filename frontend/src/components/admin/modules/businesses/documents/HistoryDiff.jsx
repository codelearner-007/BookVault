'use client';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { cn } from '@/lib/utils';
import {
  fieldLabel, headerChanges, humanize, isDateValue, isEnumValue, isMoneyKey, lineChanges, lineColumns,
} from './history-diff';

const EMPTY = '—';
const LINE_KIND = {
  added: { label: 'Added', variant: 'ok', row: 'bg-ok-soft' },
  removed: { label: 'Removed', variant: 'bad', row: 'bg-bad-soft' },
  changed: { label: 'Changed', variant: 'warn', row: 'bg-warn-soft' },
  same: { label: '', variant: 'neutral', row: '' },
};
const NUMERIC = new Set(['qty', 'unit_price', 'discount', 'debit', 'credit', 'amount', 'total']);

// One value in the business's format: money, dates, enums (posted -> Posted), Yes / No.
export function HistoryValue({ field, value }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">{EMPTY}</span>;
  if (isMoneyKey(field) && !Number.isNaN(Number(value))) return <Money value={String(value)} />;
  if (isDateValue(field, value)) return <FormattedDate value={value} />;
  if (typeof value === 'boolean' || isEnumValue(field, value)) return humanize(value);
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function FieldsTable({ rows, created }) {
  if (rows.length === 0) return null;
  return (
    <Table cards={false} className="text-sm">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Field</TableHead>
          {!created && <TableHead>Before</TableHead>}
          <TableHead>{created ? 'Value' : 'After'}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="hover:bg-transparent">
            <TableCell className="whitespace-nowrap text-muted-foreground">{fieldLabel(row.key)}</TableCell>
            {!created && <TableCell className="text-muted-foreground"><HistoryValue field={row.key} value={row.before} /></TableCell>}
            <TableCell><HistoryValue field={row.key} value={row.after} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LineCell({ field, row }) {
  const current = row.after ?? row.before;
  if (!row.changed.has(field)) return <HistoryValue field={field} value={current[field]} />;
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-1">
      <span className="text-muted-foreground line-through"><HistoryValue field={field} value={row.before[field]} /></span>
      <span className="sr-only">changed to</span>
      <HistoryValue field={field} value={row.after[field]} />
    </span>
  );
}

function LinesTable({ rows }) {
  const columns = lineColumns(rows);
  if (rows.length === 0 || columns.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Lines</h3>
      <Table cards={false} className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24"><span className="sr-only">Change</span></TableHead>
            {columns.map(([key, label]) => <TableHead key={key} className={cn(NUMERIC.has(key) && 'text-end')}>{label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.index} className={cn('hover:bg-transparent', LINE_KIND[row.kind].row)}>
              <TableCell>{row.kind !== 'same' && <Badge variant={LINE_KIND[row.kind].variant}>{LINE_KIND[row.kind].label}</Badge>}</TableCell>
              {columns.map(([key]) => (
                <TableCell key={key} className={cn(NUMERIC.has(key) && 'num', row.kind === 'removed' && 'text-muted-foreground line-through')}>
                  <LineCell field={key} row={row} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/*
  The human diff of one history entry: changed fields (a created record lists its values once) and the
  document's lines with added / removed / changed rows. A delete or post shows nothing (the action says it).
*/
export default function HistoryDiff({ entry }) {
  if (entry.action === 'void' || entry.action === 'post') return null;
  const created = !entry.before;
  const fields = headerChanges(entry.before, entry.after);
  const lines = lineChanges(entry.before, entry.after);
  const linesChanged = created || lines.some((row) => row.kind !== 'same');
  if (fields.length === 0 && !linesChanged) return null;
  return (
    <div className="space-y-4">
      <FieldsTable rows={fields} created={created} />
      {linesChanged && <LinesTable rows={lines} />}
    </div>
  );
}
