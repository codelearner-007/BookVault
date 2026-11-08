'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LIST_COPY as COPY } from '@/lib/copy/money';
import { FormattedDate, Quantity } from './business-format';
import { Money } from './money';

/*
  Every record list: one column definition drives the head, the cells and the totals row, so a value can never
  sit under the wrong header.
    columns: [{ key, label, kind, value(row), render(row), card, muted, truncate, className }]
      kind      'text' (default) | 'date' | 'money' | 'qty'. Text and dates start-align, money and qty end-align;
                dates use the business date format, money the shared <Money> (masked while balances are hidden).
      value     the raw value (default row[key]); render(row) replaces the formatted content, kind keeps alignment.
      tone      money only: the <Money> tone ('in' | 'out' | 'balance' | 'auto'), or tone(row); zero: <Money> zero.
      card      the phone-card slot: 'title' | 'end' | 'hide' | 'meta' (default: a meta line with the label).
    onView(row)   row click and the View action; onEdit(row) with canEdit(row): the Edit action (only where the
                  user has the edit right; callers also leave out records that cannot be edited, such as Void).
    menu(row)     an optional More menu after them (Delete).
    totals        { [column key]: amount }: a totals row on its own rule (qty columns total as quantities).
*/
export const COLUMN_KIND = { text: 'text', date: 'date', money: 'money', qty: 'qty' };
const END_KINDS = new Set([COLUMN_KIND.money, COLUMN_KIND.qty]);
const KIND_CELL = {
  [COLUMN_KIND.text]: 'md:whitespace-nowrap',
  [COLUMN_KIND.date]: 'whitespace-nowrap tabular-nums',
  [COLUMN_KIND.money]: 'num',
  [COLUMN_KIND.qty]: 'num',
};
const NO_LABEL_SLOTS = new Set(['title', 'end']);

function alignClass(kind) {
  return END_KINDS.has(kind) ? 'text-end' : 'text-start';
}

function rawValue(column, row) {
  return column.value ? column.value(row) : row[column.key];
}

function toneOf(column, row) {
  return typeof column.tone === 'function' ? column.tone(row) : column.tone;
}

function cellContent(column, row) {
  if (column.render) return column.render(row);
  const value = rawValue(column, row);
  if (column.kind === COLUMN_KIND.date) return <FormattedDate value={value} />;
  if (column.kind === COLUMN_KIND.money) return <Money value={value} tone={toneOf(column, row)} zero={column.zero} />;
  if (column.kind === COLUMN_KIND.qty) return <Quantity value={value} />;
  return value;
}

function cardProps(column) {
  const slot = column.card;
  return {
    'data-card': slot && slot !== 'meta' ? slot : undefined,
    'data-label': NO_LABEL_SLOTS.has(slot) ? undefined : column.label,
  };
}

/** A record's name in the title column, with its status pills after it. */
export function RecordTitle({ text, children }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      {children}
    </span>
  );
}

/** The quiet View / Edit pair at the start of a row, split by the column rule (--row-divider); `menu` adds a More menu. */
export function RowActions({ name, onView, onEdit, menu }) {
  return (
    // The cell's clicks never reach the row (the More menu opens in a portal).
    <span className="flex items-center justify-center divide-x divide-row-divider" onClick={(event) => event.stopPropagation()}>
      {onView && (
        <Button variant="ghost" size="sm" className="mx-1 px-2 font-medium" onClick={onView} aria-label={COPY.viewRecord(name)}>
          {COPY.view}
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" size="sm" className="mx-1 px-2 font-medium" onClick={onEdit} aria-label={COPY.editRecord(name)}>
          {COPY.edit}
        </Button>
      )}
      {menu}
    </span>
  );
}

function TotalsRow({ columns, totals, withActions }) {
  const several = columns.filter((column) => totals[column.key] !== undefined).length > 1;
  return (
    <TableFooter>
      <TableRow className="hover:bg-transparent">
        {withActions && <TableCell aria-hidden="true" />}
        {columns.map((column, index) => {
          const amount = totals[column.key];
          if (amount !== undefined) {
            return (
              <TableCell key={column.key} className={KIND_CELL[COLUMN_KIND.money]} data-label={several ? column.label : undefined}>
                {column.kind === COLUMN_KIND.qty ? <Quantity value={amount} /> : (
                  <Money value={amount} tone={typeof column.tone === 'function' ? undefined : column.tone} zero={column.zero === 'blank' ? 'show' : column.zero} />
                )}
              </TableCell>
            );
          }
          return <TableCell key={column.key} className={cn(index > 0 && 'max-md:hidden')}>{index === 0 ? COPY.total : null}</TableCell>;
        })}
      </TableRow>
    </TableFooter>
  );
}

export function ListTable({
  columns, rows, rowKey = (row) => row.id, rowName, onView, onEdit, canEdit = () => true, menu, totals, rowClassName,
}) {
  const visible = columns.filter(Boolean);
  const withActions = Boolean(onView || onEdit || menu);
  // A row opens its view; records without one (settings catalogs) open their edit dialog.
  const openRow = onView ?? (onEdit ? (row) => canEdit(row) && onEdit(row) : null);
  const nameOf = rowName ?? ((row) => String(rawValue(visible.find((c) => c.card === 'title') ?? visible[0], row) ?? ''));

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {withActions && <TableHead className="w-0 px-1"><span className="sr-only">{COPY.actions}</span></TableHead>}
          {visible.map((column) => (
            <TableHead key={column.key} className={alignClass(column.kind)}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={rowKey(row)}
            className={cn(openRow && 'cursor-pointer', rowClassName?.(row))}
            onClick={openRow ? () => openRow(row) : undefined}
          >
            {withActions && (
              <TableCell data-card="actions" className="md:w-0 md:px-1">
                <RowActions
                  name={nameOf(row)}
                  onView={onView && (() => onView(row))}
                  onEdit={onEdit && canEdit(row) ? () => onEdit(row) : null}
                  menu={menu?.(row)}
                />
              </TableCell>
            )}
            {visible.map((column) => (
              <TableCell
                key={column.key}
                className={cn(
                  KIND_CELL[column.kind ?? COLUMN_KIND.text],
                  column.card === 'title' && 'font-medium',
                  column.muted && 'text-muted-foreground',
                  // A truncating column takes the width left over (md+), so wide lists fit instead of scrolling.
                  column.truncate && 'truncate md:w-full md:max-w-0',
                  column.className,
                )}
                {...cardProps(column)}
              >
                {cellContent(column, row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {totals && <TotalsRow columns={visible} totals={totals} withActions={withActions} />}
    </Table>
  );
}
