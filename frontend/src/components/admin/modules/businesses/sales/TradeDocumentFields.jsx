'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DOC_TYPES } from './sales-documents';
import { CustomerPicker, InvoiceSelect } from './sales-parts';
import { DISCOUNT_TYPES, DUE_MODES, ROUNDING } from './trade-form-model';

/* The header fields and the options of a trade document form, in Manager's order. */

function TextField({ id, label, value, onChange, disabled, type = 'text', placeholder, className }) {
  return (
    <div className={className ?? 'grid gap-2'}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
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
          <Input aria-label="Due date" type="date" className="w-44" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

export function TradeHeaderFields({ businessId, config, form, setField, onCustomer, openInvoices, currentInvoice, disabled }) {
  const isType = (type) => config.type === type;
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <TextField id="trade-date" label={config.dateLabel} type="date" value={form.date} onChange={(v) => setField('date', v)} disabled={disabled} />
      {isType(DOC_TYPES.quote) && (
        <TextField id="trade-expiry" label="Expiry date" type="date" value={form.expiryDate} onChange={(v) => setField('expiryDate', v)} disabled={disabled} />
      )}
      {isType(DOC_TYPES.invoice) && !form.isStartingBalance && <DueDateField form={form} setField={setField} disabled={disabled} />}
      <TextField id="trade-reference" label="Reference" placeholder="Automatic" value={form.reference} onChange={(v) => setField('reference', v)} disabled={disabled} />
      <CustomerPicker businessId={businessId} value={form.customer} onChange={onCustomer} disabled={disabled} />
      {isType(DOC_TYPES.creditNote) && (
        <InvoiceSelect
          id="trade-invoice" invoices={openInvoices} current={currentInvoice} value={form.invoiceId}
          onChange={(id) => setField('invoiceId', id)} disabled={disabled || !form.customer}
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

const DISCOUNT_OPTIONS = [[DISCOUNT_TYPES.none, 'None'], [DISCOUNT_TYPES.percentage, 'Percentage'], [DISCOUNT_TYPES.amount, 'Exact amount']];
const ROUNDING_OPTIONS = [[ROUNDING.none, 'None'], [ROUNDING.nearest, 'To nearest'], [ROUNDING.down, 'Round down']];

// The options under the lines: tax inclusive, discount column, and the invoice terms.
export function TradeOptions({ config, form, setField, disabled }) {
  if (!config.priced) return null;
  const isInvoice = config.type === DOC_TYPES.invoice;
  return (
    <section aria-label="Options" className="space-y-4">
      <CheckOption id="trade-tax-inclusive" label="Amounts are tax inclusive" checked={form.amountsIncludeTax} onChange={(on) => setField('amountsIncludeTax', on)} disabled={disabled} />
      <SelectOption id="trade-discount" label="Discount" value={form.discountType} options={DISCOUNT_OPTIONS} onChange={(v) => setField('discountType', v)} disabled={disabled} />
      {isInvoice && (
        <>
          <SelectOption id="trade-rounding" label="Rounding" value={form.rounding} options={ROUNDING_OPTIONS} onChange={(v) => setField('rounding', v)} disabled={disabled} />
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

// Starting-balance invoices only: what the customer had already paid before the books start.
export function StartingBalanceFields({ form, setField, booksStartDate, disabled }) {
  return (
    <div className="grid gap-2 rounded-card border border-card-border p-4 sm:max-w-md">
      <p className="text-sm text-muted-foreground">
        Starting-balance invoice{booksStartDate ? `: date it before ${booksStartDate}, when the books start.` : '.'} It posts no revenue.
      </p>
      <Label htmlFor="trade-paid-before-start">Paid before start</Label>
      <Input
        id="trade-paid-before-start" inputMode="decimal" placeholder="0.00" className="num w-40"
        value={form.paidBeforeStart} onChange={(e) => setField('paidBeforeStart', e.target.value)} disabled={disabled}
      />
    </div>
  );
}
