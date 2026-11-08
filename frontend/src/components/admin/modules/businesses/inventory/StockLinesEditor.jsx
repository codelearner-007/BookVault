'use client';

import { Fragment } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldLabel, NumberCell } from '../banking/CashLinesEditor';
import { NONE } from '../sales/sales-parts';
import { inventoryItemLabel, recordLabel } from './inventory-documents';
import { emptyStockLine } from './stock-form-model';

const COLUMN_WIDTHS = {
  item: 'minmax(11rem,2fr)', description: 'minmax(9rem,2fr)', qty: '6rem', account: 'minmax(10rem,1.6fr)', amount: '8rem', remove: '2.5rem',
};
const HEAD_LABELS = { item: 'Item', description: 'Description', qty: 'Qty', account: 'Account', amount: 'Amount', remove: '' };
const NUMERIC = new Set(['qty', 'amount']);

// placeholder: the "none" entry when the field may stay empty (allowNone), else the empty-select text.
function SelectCell({ label, number, value, options, optionLabel, onChange, disabled, allowNone, placeholder }) {
  return (
    <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
      <FieldLabel>{label}</FieldLabel>
      <Select value={value || (allowNone ? NONE : '')} onValueChange={(next) => onChange(next === NONE ? '' : next)} disabled={disabled}>
        <SelectTrigger aria-label={`${label}, line ${number}`} className="w-full min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>{placeholder}</SelectItem>}
          {options.map((option) => <SelectItem key={option.id} value={option.id}>{optionLabel(option)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function LineRow({ line, number, columns, catalogs, accountPlaceholder, lineNoun, disabled, canRemove, onChange, onRemove, gridStyle }) {
  const change = (patch) => onChange(line.key, patch);
  const cells = {
    item: (
      <SelectCell
        label="Item" number={number} value={line.item_id} options={catalogs.items} optionLabel={inventoryItemLabel}
        placeholder="Select item" onChange={(id) => change({ item_id: id })} disabled={disabled}
      />
    ),
    account: (
      <SelectCell
        label="Account" number={number} value={line.account_id} options={catalogs.accounts} optionLabel={recordLabel}
        allowNone={!!accountPlaceholder} placeholder={accountPlaceholder ?? 'Select account'} onChange={(id) => change({ account_id: id })} disabled={disabled}
      />
    ),
    description: (
      <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
        <FieldLabel>Description</FieldLabel>
        <Input aria-label={`Description, line ${number}`} value={line.description} onChange={(e) => change({ description: e.target.value })} disabled={disabled} />
      </div>
    ),
    qty: <NumberCell line={line} field="qty" label="Qty" number={number} disabled={disabled} onChange={change} required />,
    amount: <NumberCell line={line} field="amount" label="Amount" number={number} disabled={disabled} onChange={change} required />,
    remove: (
      <Button
        variant="ghost" size="icon-sm" className="col-span-2 justify-self-end hover:text-bad md:col-span-1 md:mt-1"
        onClick={() => onRemove(line.key)} disabled={disabled || !canRemove} aria-label={`Remove ${lineNoun} ${number}`}
      >
        <X />
      </Button>
    ),
  };
  return (
    <li
      style={gridStyle}
      className="grid grid-cols-2 gap-3 rounded-card border border-card-border p-4 md:grid-cols-[var(--line-cols)] md:items-start md:gap-x-2 md:rounded-none md:border-0 md:p-0 md:py-1.5"
    >
      {columns.map((key) => <Fragment key={key}>{cells[key]}</Fragment>)}
    </li>
  );
}

/*
  The line grid of a stock document or kit: columns from 'item' | 'description' | 'qty' | 'account' | 'amount'.
  catalogs: { items, accounts }. accountPlaceholder: the account may stay empty (the API default it names).
  minLines 0 lets every line go (production cost lines); lineNoun names the remove buttons when two grids share a form.
  Columns on md+, stacked cards on phones.
*/
export default function StockLinesEditor({
  label, columns, lines, setLines, catalogs, accountPlaceholder, addLabel = 'Add line', lineNoun = 'line', minLines = 1, disabled,
}) {
  const visible = [...columns, 'remove'];
  const gridStyle = { '--line-cols': visible.map((key) => COLUMN_WIDTHS[key]).join(' ') };

  function changeLine(key, patch) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <section aria-label={label} className="space-y-3">
      {lines.length > 0 && (
        <>
          <div style={gridStyle} className="hidden text-xs font-medium text-muted-foreground md:grid md:grid-cols-[var(--line-cols)] md:gap-x-2" aria-hidden="true">
            {visible.map((key) => <span key={key} className={cn('px-1', NUMERIC.has(key) && 'text-end')}>{HEAD_LABELS[key]}</span>)}
          </div>
          <ol className="space-y-3 md:space-y-0">
            {lines.map((line, index) => (
              <LineRow
                key={line.key}
                line={line}
                number={index + 1}
                columns={columns}
                catalogs={catalogs}
                accountPlaceholder={accountPlaceholder}
                lineNoun={lineNoun}
                disabled={disabled}
                canRemove={lines.length > minLines}
                onChange={changeLine}
                onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
                gridStyle={gridStyle}
              />
            ))}
          </ol>
        </>
      )}
      <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyStockLine()])} disabled={disabled}>
        <Plus />
        {addLabel}
      </Button>
    </section>
  );
}
