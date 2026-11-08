import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { optionalNumber } from '../banking/CashLinesEditor';
import { DOC_TYPES, plainNumber } from './sales-documents';

/*
  Form state of a trade document and the request bodies built from it, field by field (strict API bodies:
  a field of another document type is a 422). Money stays text; the server computes every amount.
*/
export const DISCOUNT_TYPES = { none: 'none', percentage: 'percentage', amount: 'amount' };
export const ROUNDING = { none: 'none', nearest: 'nearest', down: 'down' };
export const DUE_MODES = { net: 'net', date: 'date' };
const DAY_MS = 86400000;

export function emptyTradeLine() {
  return { key: crypto.randomUUID(), item_id: '', account_id: '', description: '', qty: '', unit_price: '', discount: '', tax_code_id: '' };
}

const textOf = (value) => (value === null || value === undefined ? '' : toInputAmount(value));

// Calendar arithmetic on ISO dates (not money): `days` after `iso`.
export function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function linesFrom(source) {
  const lines = (source.lines ?? []).map((line) => ({
    key: line.id ?? crypto.randomUUID(),
    item_id: line.item_id ?? '',
    account_id: line.account_id ?? '',
    description: line.description ?? '',
    qty: plainNumber(line.qty),
    unit_price: textOf(line.unit_price),
    discount: textOf(line.discount),
    tax_code_id: line.tax_code_id ?? '',
  }));
  return lines.length > 0 ? lines : [emptyTradeLine()];
}

/*
  Form state from a saved document, a copy-to prefill (a create body) or nothing (a new form).
  customer: { id, name } | null. options: { sourceId, startingBalance, openingDate }.
*/
export function tradeForm(source, customer, { sourceId = null, startingBalance = false, openingDate = null } = {}) {
  const src = source ?? {};
  return {
    date: src.date ?? (startingBalance && openingDate ? openingDate : todayIso()),
    reference: src.reference ?? '',
    customer,
    billingAddress: src.billing_address ?? '',
    deliveryAddress: src.delivery_address ?? '',
    description: src.description ?? '',
    amountsIncludeTax: src.amounts_include_tax ?? false,
    discountType: src.discount_type ?? DISCOUNT_TYPES.none,
    lines: linesFrom(src),
    expiryDate: src.expiry_date ?? '',
    dueMode: src.due_date ? DUE_MODES.date : DUE_MODES.net,
    dueDays: '',
    dueDate: src.due_date ?? '',
    rounding: src.rounding_method ?? src.rounding ?? ROUNDING.none,
    earlyDiscount: !!src.early_discount_rate,
    earlyDiscountRate: plainNumber(src.early_discount_rate),
    earlyDiscountDays: src.early_discount_days ?? '',
    lateFee: !!src.late_fee_rate,
    lateFeeRate: plainNumber(src.late_fee_rate),
    invoiceId: src.invoice_id ?? '',
    isStartingBalance: src.is_starting_balance ?? startingBalance,
    paidBeforeStart: textOf(src.paid_before_start),
    sourceId,
  };
}

function isBlankLine(line) {
  return !line.item_id && !line.account_id && !line.description.trim() && !line.qty.trim()
    && !line.unit_price.trim() && !line.discount.trim() && !line.tax_code_id;
}

export function isInvalidTradeLine(line, priced) {
  const badOptional = (text) => text.trim() !== '' && parseAmount(text) === null;
  if (!priced) return badOptional(line.qty);
  return parseAmount(line.unit_price) === null || badOptional(line.qty) || badOptional(line.discount);
}

// The POST /totals body of the lines on screen, or null while an amount cannot be read.
export function totalsRequest(form, config) {
  if (!config.priced || form.lines.some((line) => isInvalidTradeLine(line, true))) return null;
  return {
    amounts_include_tax: form.amountsIncludeTax,
    discount_type: form.discountType === DISCOUNT_TYPES.none ? null : form.discountType,
    ...(config.type === DOC_TYPES.invoice ? { rounding: form.rounding } : {}),
    lines: form.lines.map((line) => ({
      qty: optionalNumber(line.qty),
      unit_price: parseAmount(line.unit_price),
      discount: form.discountType === DISCOUNT_TYPES.none ? null : optionalNumber(line.discount),
      tax_code_id: line.tax_code_id || null,
    })),
  };
}

function lineBody(line, form, config) {
  if (!config.priced) return { item_id: line.item_id || null, description: line.description.trim() || null, qty: optionalNumber(line.qty) };
  return {
    item_id: line.item_id || null,
    ...(config.accounts ? { account_id: line.account_id || null } : {}),
    description: line.description.trim() || null,
    qty: optionalNumber(line.qty),
    unit_price: parseAmount(line.unit_price),
    discount: form.discountType === DISCOUNT_TYPES.none ? null : optionalNumber(line.discount),
    tax_code_id: line.tax_code_id || null,
  };
}

function invoiceFields(form, creditLimitOverride) {
  const netDays = form.dueDays === '' ? null : Number(form.dueDays);
  const dueDate = form.dueMode === DUE_MODES.date ? form.dueDate || null : netDays === null ? null : addDays(form.date, netDays);
  return {
    due_date: dueDate,
    rounding: form.rounding,
    early_discount_rate: form.earlyDiscount ? optionalNumber(form.earlyDiscountRate) : null,
    early_discount_days: form.earlyDiscount && form.earlyDiscountDays !== '' ? Number(form.earlyDiscountDays) : null,
    late_fee_rate: form.lateFee ? optionalNumber(form.lateFeeRate) : null,
    credit_limit_override: creditLimitOverride,
    ...(form.isStartingBalance ? { is_starting_balance: true, paid_before_start: optionalNumber(form.paidBeforeStart) ?? '0' } : {}),
  };
}

function typeFields(form, config, creditLimitOverride) {
  if (config.type === DOC_TYPES.quote) return { expiry_date: form.expiryDate || null };
  if (config.type === DOC_TYPES.invoice) return invoiceFields(form, creditLimitOverride);
  if (config.type === DOC_TYPES.creditNote) return { invoice_id: form.invoiceId || null };
  if (config.type === DOC_TYPES.deliveryNote) return { delivery_address: form.deliveryAddress.trim() || null };
  return {};
}

function validate(form, lines, config) {
  if (!form.date) return 'Date is required.';
  if (!form.customer) return 'Choose a customer.';
  if (lines.length === 0) return 'Add at least one line.';
  if (lines.some((line) => isInvalidTradeLine(line, config.priced))) return 'Amounts must be numbers, for example 1250.00.';
  if (!config.priced && lines.some((line) => !line.item_id)) return 'Choose an item on every line.';
  const badRate = (on, text) => on && text.trim() !== '' && parseAmount(text) === null;
  if (badRate(form.earlyDiscount, form.earlyDiscountRate) || badRate(form.lateFee, form.lateFeeRate)) return 'Rates must be numbers, for example 2.5.';
  return null;
}

// Field-by-field create / update body; returns { error } when the form cannot be sent.
export function buildTradeBody(form, config, { creditLimitOverride = false } = {}) {
  const lines = form.lines.filter((line) => !isBlankLine(line));
  const error = validate(form, lines, config);
  if (error) return { error };
  const priced = config.priced
    ? {
      billing_address: form.billingAddress.trim() || null,
      amounts_include_tax: form.amountsIncludeTax,
      discount_type: form.discountType === DISCOUNT_TYPES.none ? null : form.discountType,
    }
    : {};
  return {
    body: {
      date: form.date,
      reference: form.reference.trim() || null,
      customer_id: form.customer.id,
      description: form.description.trim() || null,
      ...priced,
      lines: lines.map((line) => lineBody(line, form, config)),
      ...typeFields(form, config, creditLimitOverride),
    },
  };
}
