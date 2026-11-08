'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormattedDate } from '@/components/common/business-format';
import { DatePicker } from '@/components/common/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_LOCATION_LABEL } from '../inventory/inventory-documents';
import { RecordSelect } from './catalog-dialog';
import { DOC_TYPES, ROLES, TRADE_SIDES, WHT_TYPES } from './sales-documents';
import { InvoiceSelect, TradePartyPicker } from './sales-parts';
import { DISCOUNT_TYPES, DUE_MODES, ROUNDING, emptyFreightLine } from './trade-form-model';

/* The header fields and the options of a trade document form, in Manager's order. */

function TextField({ id, label, value, onChange, disabled, type = 'text', placeholder, className }) {
  return (
    <div className={className ?? 'grid gap-2'}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function DateField({ id, label, value, onChange, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <DatePicker id={id} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function AddressField({ id, label, value, onChange, disabled }) {
  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="max-w-md" />
    </div>
  );
}

// Due date: "Net N days" after the issue date, or a date.
function DueDateField({ form, setField, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="trade-due-mode">Due date</Label>
      <div className="flex gap-2">
        <Select value={form.dueMode} onValueChange={(mode) => setField('dueMode', mode)} disabled={disabled}>
          <SelectTrigger id="trade-due-mode" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DUE_MODES.net}>Net</SelectItem>
            <SelectItem value={DUE_MODES.date}>On date</SelectItem>
          </SelectContent>
        </Select>
        {form.dueMode === DUE_MODES.net ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Days after the issue date" inputMode="numeric" className="num w-20" value={form.dueDays}
              onChange={(e) => setField('dueDays', e.target.value.replace(/\D/g, ''))} disabled={disabled}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        ) : (
          <DatePicker aria-label="Due date" className="w-44" value={form.dueDate} onChange={(value) => setField('dueDate', value)} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

// Where the document moves stock; blank is the default location. locations: null when the user cannot list them.
function LocationSelect({ form, setField, locations, disabled }) {
  return (
    <RecordSelect
      id="trade-location" label="Inventory location" value={form.locationId} options={locations} noneLabel={DEFAULT_LOCATION_LABEL}
      onChange={(id) => setField('locationId', id)} disabled={disabled}
    />
  );
}

export function TradeHeaderFields({ businessId, config, form, setField, onParty, openInvoices, currentInvoice, locations, disabled }) {
  const isType = (type) => config.type === type;
  const isRole = (role) => config.role === role;
  // Manager: a delivery note moves stock From the location To the customer; a goods receipt From the supplier.
  const location = isRole(ROLES.stock) && locations && <LocationSelect form={form} setField={setField} locations={locations} disabled={disabled} />;
  const isSales = config.side === TRADE_SIDES.sales;
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <DateField id="trade-date" label={config.dateLabel} value={form.date} onChange={(v) => setField('date', v)} disabled={disabled} />
      {isType(DOC_TYPES.quote) && (
        <DateField id="trade-expiry" label="Expiry date" value={form.expiryDate} onChange={(v) => setField('expiryDate', v)} disabled={disabled} />
      )}
      {isRole(ROLES.invoice) && !form.isStartingBalance && <DueDateField form={form} setField={setField} disabled={disabled} />}
      <TextField id="trade-reference" label="Reference" placeholder="Automatic" value={form.reference} onChange={(v) => setField('reference', v)} disabled={disabled} />
      {isSales && location}
      <TradePartyPicker businessId={businessId} side={config.side} value={form.party} onChange={onParty} disabled={disabled} />
      {!isSales && location}
      {isRole(ROLES.note) && (
        <InvoiceSelect
          id="trade-invoice" label={config.side.invoiceLabel} invoices={openInvoices} current={currentInvoice} value={form.invoiceId}
          onChange={(id) => setField('invoiceId', id)} disabled={disabled || !form.party}
        />
      )}
      {config.priced && (
        <AddressField id="trade-billing" label="Billing address" value={form.billingAddress} onChange={(v) => setField('billingAddress', v)} disabled={disabled} />
      )}
      {isType(DOC_TYPES.deliveryNote) && (
        <AddressField id="trade-delivery" label="Delivery address" value={form.deliveryAddress} onChange={(v) => setField('deliveryAddress', v)} disabled={disabled} />
      )}
      <TextField id="trade-description" label="Description" className="grid gap-2 sm:col-span-2" value={form.description} onChange={(v) => setField('description', v)} disabled={disabled} />
    </div>
  );
}

function CheckOption({ id, label, checked, onChange, disabled, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} disabled={disabled} />
        <Label htmlFor={id} className="font-normal">{label}</Label>
      </div>
      {checked && children && <div className="flex flex-wrap items-center gap-2 ps-6">{children}</div>}
    </div>
  );
}

function RateInput({ label, value, onChange, disabled, suffix }) {
  return (
    <span className="flex items-center gap-2">
      <Input aria-label={label} inputMode="decimal" className="num w-24 text-end" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </span>
  );
}

function SelectOption({ id, label, value, options, onChange, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="w-32 font-normal">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// Purchase invoices: freight paid to bring the goods in, capitalised to the inventory lines.
function FreightInRows({ rows, setField, disabled }) {
  const setRows = (next) => setField('freightIn', next);
  const update = (key, field, value) => setRows(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  return (
    <div className="grid max-w-xl gap-2 ps-6">
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <Input
            aria-label={`Freight-in ${index + 1} description`} placeholder="Description" value={row.description}
            onChange={(e) => update(row.key, 'description', e.target.value)} disabled={disabled}
          />
          <Input
            aria-label={`Freight-in ${index + 1} amount`} placeholder="0.00" inputMode="decimal" className="num w-32 text-end"
            value={row.amount} onChange={(e) => update(row.key, 'amount', e.target.value)} disabled={disabled}
          />
          <Button
            variant="ghost" size="icon" aria-label={`Remove freight-in ${index + 1}`} onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
            disabled={disabled || rows.length === 1}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button variant="ghost" className="justify-self-start" onClick={() => setRows([...rows, emptyFreightLine()])} disabled={disabled}>
        <Plus />
        Add freight-in
      </Button>
    </div>
  );
}

const DISCOUNT_OPTIONS =[[DISCOUNT_TYPES.none, 'None'], [DISCOUNT_TYPES.percentage, 'Percentage'], [DISCOUNT_TYPES.amount, 'Exact amount']];
const ROUNDING_OPTIONS = [[ROUNDING.none, 'None'], [ROUNDING.nearest, 'To nearest'], [ROUNDING.down, 'Round down']];

// The options under the lines: tax inclusive, discount column, the invoice terms and the "Also acts as" checkbox
// (with its inventory location, like Manager).
// showWht: the business shows withholding tax on this type (or the document already has it).
export function TradeOptions({ config, form, setField, isEdit, locations, showWht, disabled }) {
  if (!config.priced) return null;
  const check = (field) => ({ checked: form[field], onChange: (on) => setField(field, on), disabled });
  return (
    <section aria-label="Options" className="space-y-4">
      <CheckOption id="trade-tax-inclusive" label="Amounts are tax inclusive" {...check('amountsIncludeTax')} />
      <SelectOption id="trade-discount" label="Discount" value={form.discountType} options={DISCOUNT_OPTIONS} onChange={(v) => setField('discountType', v)} disabled={disabled} />
      {config.role === ROLES.invoice && (
        <SelectOption id="trade-rounding" label="Rounding" value={form.rounding} options={ROUNDING_OPTIONS} onChange={(v) => setField('rounding', v)} disabled={disabled} />
      )}
      {config.stockMovementLabel && (
        <CheckOption id="trade-stock-movement" label={config.stockMovementLabel} {...check('actsAsStockMovement')}>
          {locations && <div className="w-64"><LocationSelect form={form} setField={setField} locations={locations} disabled={disabled} /></div>}
        </CheckOption>
      )}
      {config.closable && isEdit && <CheckOption id="trade-closed" label="Closed invoice" {...check('isClosed')} />}
      {showWht && (
        <CheckOption id="trade-wht" label="Withholding tax" {...check('wht')}>
          <Select value={form.whtType} onValueChange={(type) => setField('whtType', type)} disabled={disabled}>
            <SelectTrigger aria-label="Withholding tax type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHT_TYPES.percentage}>Percentage</SelectItem>
              <SelectItem value={WHT_TYPES.amount}>Exact amount</SelectItem>
            </SelectContent>
          </Select>
          <RateInput
            label={form.whtType === WHT_TYPES.percentage ? 'Withholding tax rate' : 'Withholding tax amount'} value={form.whtValue}
            onChange={(v) => setField('whtValue', v)} disabled={disabled} suffix={form.whtType === WHT_TYPES.percentage ? '%' : ''}
          />
        </CheckOption>
      )}
      {config.freightIn && (
        <div className="space-y-3">
          <CheckOption id="trade-freight" label="Freight-in" {...check('freightOn')} />
          {form.freightOn && <FreightInRows rows={form.freightIn} setField={setField} disabled={disabled} />}
        </div>
      )}
      {config.type === DOC_TYPES.invoice && (
        <>
          <CheckOption id="trade-early-discount" label="Early payment discount" checked={form.earlyDiscount} onChange={(on) => setField('earlyDiscount', on)} disabled={disabled}>
            <RateInput label="Early payment discount rate" value={form.earlyDiscountRate} onChange={(v) => setField('earlyDiscountRate', v)} disabled={disabled} suffix="% if paid within" />
            <RateInput label="Early payment discount days" value={form.earlyDiscountDays} onChange={(v) => setField('earlyDiscountDays', v.replace(/\D/g, ''))} disabled={disabled} suffix="days" />
          </CheckOption>
          <CheckOption id="trade-late-fee" label="Late payment fees" checked={form.lateFee} onChange={(on) => setField('lateFee', on)} disabled={disabled}>
            <RateInput label="Late payment fee rate" value={form.lateFeeRate} onChange={(v) => setField('lateFeeRate', v)} disabled={disabled} suffix="% per month" />
          </CheckOption>
        </>
      )}
    </section>
  );
}

// Starting-balance invoices only: what had already been paid on it before the books start.
export function StartingBalanceFields({ config, form, setField, booksStartDate, disabled }) {
  return (
    <div className="grid gap-2 rounded-card border border-card-border p-4 sm:max-w-md">
      <p className="text-sm text-muted-foreground">
        Starting-balance invoice{booksStartDate ? <>: date it before <FormattedDate value={booksStartDate} />, when the books start.</> : '.'} It posts no {config.side.ledgerEffect}.
      </p>
      <Label htmlFor="trade-paid-before-start">Paid before start</Label>
      <Input
        id="trade-paid-before-start" inputMode="decimal" placeholder="0.00" className="num w-40"
        value={form.paidBeforeStart} onChange={(e) => setField('paidBeforeStart', e.target.value)} disabled={disabled}
      />
    </div>
  );
}
