/*
  Human differences between two record snapshots (the API responses stored in audit before / after):
  header fields (ids hidden, names shown) and document lines matched by position (added / removed / changed).
*/

// Bookkeeping and derived values that are not edits a person made.
const HIDDEN = new Set([
  'id', 'business_id', 'owner_id', 'version', 'created_at', 'updated_at', 'deleted_at', 'is_locked', 'warnings',
  'links', 'applied', 'late_fees', 'display_status', 'balance_due', 'difference', 'tax_breakdown', 'lines',
  'total_debit', 'total_credit',
]);
const MONEY_KEYS = /(^|_)(amount|total|subtotal|debit|credit|unit_price|net|tax|discount|rounding|freight|price|balance|limit)(_|$)/;
const DATE_KEYS = /(^date$|_date$|_on$|^until$)/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Line columns in display order; a column shows when any line of either version has it.
export const LINE_COLUMNS = [
  ['account_name', 'Account'], ['item_name', 'Item'], ['description', 'Description'], ['qty', 'Qty'],
  ['unit_price', 'Unit price'], ['discount', 'Discount'], ['debit', 'Debit'], ['credit', 'Credit'],
  ['amount', 'Amount'], ['total', 'Amount'],
];
const LABELS = {
  date: 'Date', reference: 'Reference', description: 'Description', total: 'Total', status: 'Status',
  bank_account: 'Bank account', counterparty: 'Paid by / payee', counterparty_kind: 'Counterparty type',
  clears_later: 'Clears later', cleared_on: 'Cleared on', due_date: 'Due date', expiry_date: 'Expiry date',
};

export const ACTION_LABELS = {
  create: 'Created', update: 'Edited', post: 'Posted', void: 'Deleted', restore: 'Restored', delete: 'Deleted',
};

export function fieldLabel(key) {
  if (LABELS[key]) return LABELS[key];
  const text = key.replace(/_id$/, '').replace(/_name$/, '').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const isMoneyKey = (key) => MONEY_KEYS.test(key);
export const isDateValue = (key, value) => DATE_KEYS.test(key) && typeof value === 'string' && ISO_DATE.test(value);

// posted -> Posted, sales_invoice -> Sales invoice, true -> Yes.
export function humanize(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = String(value).replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
const ENUM_VALUE = /^[a-z]+(_[a-z]+)*$/;
export const isEnumValue = (key, value) => typeof value === 'string' && ENUM_VALUE.test(value)
  && /(status|kind|type|direction|mode|source|action)$/.test(key);

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function shownValue(key, snapshot) {
  if (!snapshot) return null;
  // An id field shows the name the snapshot carries next to it (customer_id -> customer_name).
  if (key.endsWith('_id')) return snapshot[key.replace(/_id$/, '_name')] ?? null;
  return snapshot[key];
}

function shownKeys(snapshot) {
  return Object.keys(snapshot ?? {}).filter((key) => {
    if (HIDDEN.has(key) || key.endsWith('_code')) return false;
    if (key.endsWith('_name') && `${key.replace(/_name$/, '')}_id` in snapshot) return false;
    if (key.endsWith('_id') && !(`${key.replace(/_id$/, '')}_name` in snapshot)) return false;
    const value = snapshot[key];
    return value === null || typeof value !== 'object';
  });
}

// Header rows: every field for a created record, only the changed ones otherwise.
export function headerChanges(before, after) {
  const keys = [...new Set([...shownKeys(before), ...shownKeys(after)])];
  return keys
    .map((key) => ({ key, before: shownValue(key, before), after: shownValue(key, after) }))
    .filter((row) => (before ? !same(row.before, row.after) : row.after !== null && row.after !== ''));
}

const lineValues = (line) => Object.fromEntries(LINE_COLUMNS.map(([key]) => [key, line?.[key] ?? null]));

// Lines matched by position: { kind: added | removed | changed | same, before, after, changed: Set<key> }.
export function lineChanges(before, after) {
  const old = before?.lines ?? [];
  const next = after?.lines ?? [];
  const rows = [];
  for (let index = 0; index < Math.max(old.length, next.length); index += 1) {
    const a = old[index] && lineValues(old[index]);
    const b = next[index] && lineValues(next[index]);
    const changed = new Set(LINE_COLUMNS.map(([key]) => key).filter((key) => a && b && !same(a[key], b[key])));
    const kind = !a ? 'added' : !b ? 'removed' : changed.size > 0 ? 'changed' : 'same';
    rows.push({ index, kind, before: a, after: b, changed });
  }
  return rows;
}

// The line columns any version uses (Amount once: amount or total).
export function lineColumns(rows) {
  const used = LINE_COLUMNS.filter(([key]) => rows.some((row) => (row.before?.[key] ?? row.after?.[key]) != null));
  return used.filter(([key]) => key !== 'total' || !used.some(([other]) => other === 'amount'));
}
