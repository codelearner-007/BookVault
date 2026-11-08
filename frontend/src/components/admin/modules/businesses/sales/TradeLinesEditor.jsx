'use client';

import { Fragment } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/lib/utils/money';
import { toInputAmount } from '../coa/coa-tree';
import { FieldLabel, NumberCell } from '../banking/CashLinesEditor';
import { NONE } from './sales-parts';
import { DISCOUNT_TYPES, emptyTradeLine } from './trade-form-model';

const MIN_LINES = 1;
const COLUMN_WIDTHS = {
  item: 'minmax(9rem,1.4fr)', account: 'minmax(10rem,1.4fr)', description: 'minmax(9rem,2fr)', qty: '5.5rem',
  unit_price: '7.5rem', discount: '6.5rem', tax: 'minmax(7rem,1fr)', total: '7.5rem', remove: '2.5rem',
};
const HEAD_LABELS = {
  item: 'Item', account: 'Account', description: 'Description', qty: 'Qty', unit_price: 'Unit price', discount: 'Discount',
  tax: 'Tax code', total: 'Total', remove: '',
};
const TEXT_COLUMNS = ['item', 'account', 'description', 'tax'];

function optionLabel(record) {
  return record.code ? `${record.code} · ${record.name}` : record.name;
}

// A Select over a small catalog with a "None" entry (items, tax codes) or without one (accounts).
function CatalogCell({ label, number, value, options, onChange, disabled, allowNone, placeholder, className }) {
  return (
    <div className={cn('grid gap-1.5 md:block', className)}>
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

// Picking an item fills the line from it: description, sales price, income account and tax code.
function itemPatch(item, config) {
  if (!item) return { item_id: '' };
  return {
    item_id: item.id,
    description: item.description ?? item.name,
    ...(config.priced ? { unit_price: toInputAmount(item.sales_unit_price), tax_code_id: item.tax_code_id ?? '' } : {}),
    ...(config.accounts ? { account_id: item.income_account_id } : {}),
  };
}

function LineRow({ line, number, visible, config, catalogs, total, disabled, canRemove, onChange, onRemove, gridStyle }) {
  const change = (patch) => onChange(line.key, patch);
  const cells = {
    item: (
      <CatalogCell
        label="Item" number={number} value={line.item_id} options={catalogs.items} allowNone placeholder="No item"
        onChange={(id) => change(itemPatch(catalogs.items.find((item) => item.id === id), config))} disabled={disabled}
        className="col-span-2 md:col-span-1"
      />
    ),
    account: (
      <CatalogCell
        label="Account" number={number} value={line.account_id} options={catalogs.accounts} placeholder="Select account"
        onChange={(id) => change({ account_id: id })} disabled={disabled} className="col-span-2 md:col-span-1"
      />
    ),
    description: (
      <div className="col-span-2 grid gap-1.5 md:col-span-1 md:block">
        <FieldLabel>Description</FieldLabel>
        <Input aria-label={`Description, line ${number}`} value={line.description} onChange={(e) => change({ description: e.target.value })} disabled={disabled} />
      </div>
    ),
    qty: <NumberCell line={line} field="qty" label="Qty" number={number} disabled={disabled} onChange={change} />,
    unit_price: <NumberCell line={line} field="unit_price" label="Unit price" number={number} disabled={disabled} onChange={change} required />,
    discount: <NumberCell line={line} field="discount" label="Discount" number={number} disabled={disabled} onChange={change} />,
    tax: (
      <CatalogCell
        label="Tax code" number={number} value={line.tax_code_id} options={catalogs.taxCodes} allowNone placeholder="No tax"
        onChange={(id) => change({ tax_code_id: id })} disabled={disabled}
      />
    ),
    total: (
      <div className="grid gap-1.5 md:flex md:h-control md:items-center md:justify-end md:pe-3.5">
        <FieldLabel>Total</FieldLabel>
        <span className="num">{total === undefined ? '—' : formatMoney(total)}</span>
      </div>
    ),
    remove: (
      <Button
        variant="ghost" size="icon-sm" className="col-span-2 justify-self-end hover:text-bad md:col-span-1 md:mt-1"
        onClick={() => onRemove(line.key)} disabled={disabled || !canRemove} aria-label={`Remove line ${number}`}
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
      {visible.map((key) => <Fragment key={key}>{cells[key]}</Fragment>)}
    </li>
  );
}

/*
  The line grid of a trade document: Item, Account (invoices, credit notes), Description, Qty, Unit price,
  Discount (when a discount type is set), Tax code and the server-computed line total. Delivery notes keep
  Item, Description and Qty. Columns on md+, stacked cards on phones (the totals bar sits under the grid).
*/
export default function TradeLinesEditor({ config, lines, setLines, discountType, catalogs, lineTotals, disabled }) {
  const visible = [
    'item', config.accounts && 'account', 'description', 'qty',
    ...(config.priced ? ['unit_price', discountType !== DISCOUNT_TYPES.none && 'discount', 'tax', 'total'] : []),
    'remove',
  ].filter(Boolean);
  const gridStyle = { '--line-cols': visible.map((key) => COLUMN_WIDTHS[key]).join(' ') };

  function changeLine(key, patch) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <section aria-label="Lines" className="space-y-3">
      <div style={gridStyle} className="hidden text-xs font-medium text-muted-foreground md:grid md:grid-cols-[var(--line-cols)] md:gap-x-2" aria-hidden="true">
        {visible.map((key) => (
          <span key={key} className={cn('px-1', !TEXT_COLUMNS.includes(key) && 'text-end')}>{HEAD_LABELS[key]}</span>
        ))}
      </div>
      <ol className="space-y-3 md:space-y-0">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            line={line}
            number={index + 1}
            visible={visible}
            config={config}
            catalogs={catalogs}
            total={lineTotals?.[index]?.total}
            disabled={disabled}
            canRemove={lines.length > MIN_LINES}
            onChange={changeLine}
            onRemove={(key) => setLines((prev) => prev.filter((l) => l.key !== key))}
            gridStyle={gridStyle}
          />
        ))}
      </ol>
      <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyTradeLine()])} disabled={disabled}>
        <Plus />
        Add line
      </Button>
    </section>
  );
}
