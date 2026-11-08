import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { optionalNumber } from '../banking/CashLinesEditor';
import { DOC_TYPES, ROLES, WHT_TYPES, plainNumber } from './sales-documents';

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
  party: the customer or supplier { id, name } | null. options: { sourceId, startingBalance, openingDate }.
*/
export function tradeForm(source, party, { sourceId = null, startingBalance = false, openingDate = null } = {}) {
  const src = source ?? {};
  return {
    date: src.date ?? (startingBalance && openingDate ? openingDate : todayIso()),
    reference: src.reference ?? '',
    party,
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
    actsAsStockMovement: src.acts_as_stock_movement ?? false,
    locationId: src.location_id ?? '',
    isClosed: src.is_closed ?? false,
    wht: !!src.withholding_tax,
    whtType: src.withholding_tax?.type ?? WHT_TYPES.percentage,
    whtValue: textOf(src.withholding_tax?.value),
    freightOn: (src.freight_in ?? []).length > 0,
    freightIn: freightFrom(src),
    sourceId,
  };
}

export function emptyFreightLine() {
  return { key: crypto.randomUUID(), description: '', amount: '' };
}

function freightFrom(source) {
  const rows = (source.freight_in ?? []).map((row) => ({
    key: crypto.randomUUID(), description: row.description ?? '', amount: textOf(row.amount),
  }));
  return rows.length > 0 ? rows : [emptyFreightLine()];
}

const isBlankFreight = (row) => !row.description.trim() && !row.amount.trim();

// Withholding tax (sales invoices, credit notes, purchase invoices): { withholding_tax } or { invalid }.
function whtFields(form, config) {
  if (!config.withholdingTax) return {};
  if (!form.wht) return { withholding_tax: null };
  const value = parseAmount(form.whtValue);
  if (!form.whtValue.trim() || value === null) return { invalid: true };
  return { withholding_tax: { type: form.whtType, value } };
}

// Freight-in rows (purchase invoices): { freight_in } or { invalid }.
function freightFields(form, config) {
  if (!config.freightIn) return {};
  if (!form.freightOn) return { freight_in: [] };
  const rows = form.freightIn.filter((row) => !isBlankFreight(row));
  if (rows.some((row) => parseAmount(row.amount) === null || !row.amount.trim())) return { invalid: true };
  return { freight_in: rows.map((row) => ({ description: row.description.trim() || null, amount: parseAmount(row.amount) })) };
}

// WHT and freight-in fields of a body, or null while an amount cannot be read.
function chargeFields(form, config) {
  const wht = whtFields(form, config);
  const freight = freightFields(form, config);
  if (wht.invalid || freight.invalid) return null;
  return { ...wht, ...freight };
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
  const charges = chargeFields(form, config);
  if (!charges) return null;
  return {
    ...charges,
    amounts_include_tax: form.amountsIncludeTax,
    discount_type: form.discountType === DISCOUNT_TYPES.none ? null : form.discountType,
    ...(config.role === ROLES.invoice ? { rounding: form.rounding } : {}),
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

// Sales invoices only: early payment discount, late fees and the credit-limit override.
function salesTerms(form, creditLimitOverride) {
  return {
    early_discount_rate: form.earlyDiscount ? optionalNumber(form.earlyDiscountRate) : null,
    early_discount_days: form.earlyDiscount && form.earlyDiscountDays !== '' ? Number(form.earlyDiscountDays) : null,
    late_fee_rate: form.lateFee ? optionalNumber(form.lateFeeRate) : null,
    credit_limit_override: creditLimitOverride,
  };
}

function invoiceFields(form, config, { creditLimitOverride, isEdit }) {
  const netDays = form.dueDays === '' ? null : Number(form.dueDays);
  const dueDate = form.dueMode === DUE_MODES.date ? form.dueDate || null : netDays === null ? null : addDays(form.date, netDays);
  return {
    due_date: dueDate,
    rounding: form.rounding,
    ...(config.type === DOC_TYPES.invoice ? salesTerms(form, creditLimitOverride) : {}),
    ...stockFields(form, config),
    // The API takes is_closed on update only (no ledger effect).
    ...(config.closable && isEdit ? { is_closed: form.isClosed } : {}),
    ...(form.isStartingBalance ? { is_starting_balance: true, paid_before_start: optionalNumber(form.paidBeforeStart) ?? '0' } : {}),
  };
}

// Where stock moves (null = the default location): stock documents always; invoices and notes only while they
// also act as a stock document.
function stockFields(form, config) {
  if (config.role === ROLES.stock) return { location_id: form.locationId || null };
  if (!config.stockMovementLabel) return {};
  return { acts_as_stock_movement: form.actsAsStockMovement, location_id: form.actsAsStockMovement ? form.locationId || null : null };
}

function typeFields(form, config, options) {
  if (config.type === DOC_TYPES.quote) return { expiry_date: form.expiryDate || null };
  if (config.role === ROLES.invoice) return invoiceFields(form, config, options);
  if (config.role === ROLES.note) return { invoice_id: form.invoiceId || null, ...stockFields(form, config) };
  if (config.type === DOC_TYPES.deliveryNote) return { delivery_address: form.deliveryAddress.trim() || null, ...stockFields(form, config) };
  return stockFields(form, config);
}

function validate(form, lines, config) {
  if (!form.date) return 'Date is required.';
  if (!form.party) return `Choose a ${config.side.partyNoun}.`;
  if (lines.length === 0) return 'Add at least one line.';
  if (lines.some((line) => isInvalidTradeLine(line, config.priced))) return 'Amounts must be numbers, for example 1250.00.';
  if (!config.priced && lines.some((line) => !line.item_id)) return 'Choose an item on every line.';
  const badRate = (on, text) => on && text.trim() !== '' && parseAmount(text) === null;
  if (badRate(form.earlyDiscount, form.earlyDiscountRate) || badRate(form.lateFee, form.lateFeeRate)) return 'Rates must be numbers, for example 2.5.';
  return null;
}

// Field-by-field create / update body; returns { error } when the form cannot be sent.
export function buildTradeBody(form, config, { creditLimitOverride = false, isEdit = false } = {}) {
  const lines = form.lines.filter((line) => !isBlankLine(line));
  const error = validate(form, lines, config);
  if (error) return { error };
  const charges = chargeFields(form, config);
  if (!charges) return { error: 'Withholding tax and freight-in amounts must be numbers, for example 5 or 120.00.' };
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
      [config.side.partyField]: form.party.id,
      description: form.description.trim() || null,
      ...priced,
      lines: lines.map((line) => lineBody(line, form, config)),
      ...typeFields(form, config, { creditLimitOverride, isEdit }),
      ...charges,
    },
  };
}
