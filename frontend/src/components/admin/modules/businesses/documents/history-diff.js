/*
  Field-level differences between two document snapshots (the API responses stored in audit before / after):
  header fields, then lines added / removed / changed. Money-like keys are flagged so the panel renders them
  with <Money>.
*/

// Bookkeeping and derived values that are not edits a person made.
const HIDDEN = new Set([
  'id', 'business_id', 'version', 'created_at', 'updated_at', 'is_locked', 'warnings', 'links', 'applied',
  'late_fees', 'display_status', 'balance_due', 'difference', 'tax_breakdown', 'lines',
]);
const MONEY_KEYS = /(^|_)(amount|total|subtotal|debit|credit|unit_price|net|tax|discount|rounding|freight|price)(_|$)/;
const LINE_KEYS = ['account_name', 'item_name', 'description', 'qty', 'unit_price', 'debit', 'credit', 'amount', 'total'];

export const ACTION_LABELS = {
  create: 'Created', update: 'Edited', post: 'Posted', void: 'Deleted', restore: 'Restored',
};

export function fieldLabel(key) {
  const text = key.replace(/_id$/, '').replace(/_name$/, '').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isMoneyKey(key) {
  return MONEY_KEYS.test(key);
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function visibleValue(key, value, snapshot) {
  // An id field shows the name the snapshot carries next to it (customer_id -> customer_name).
  if (key.endsWith('_id')) return snapshot?.[key.replace(/_id$/, '_name')] ?? value;
  return value;
}

export function headerChanges(before, after) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .filter((key) => !HIDDEN.has(key) && !(key.endsWith('_name') && (key.replace(/_name$/, '_id') in (after ?? before ?? {}))))
    .filter((key) => typeof (after?.[key] ?? before?.[key]) !== 'object' || (after?.[key] ?? before?.[key]) === null)
    .filter((key) => !same(before?.[key], after?.[key]))
    .map((key) => ({ key, before: visibleValue(key, before?.[key], before), after: visibleValue(key, after?.[key], after) }));
}

function lineSummary(line) {
  return LINE_KEYS.filter((key) => line[key] !== null && line[key] !== undefined && line[key] !== '')
    .map((key) => ({ key, value: line[key] }));
}

// Lines matched by position: added, removed, or changed (only the keys that moved).
export function lineChanges(before, after) {
  const old = before?.lines ?? [];
  const next = after?.lines ?? [];
  const rows = [];
  for (let index = 0; index < Math.max(old.length, next.length); index += 1) {
    const a = old[index];
    const b = next[index];
    if (!a) rows.push({ index, kind: 'added', fields: lineSummary(b) });
    else if (!b) rows.push({ index, kind: 'removed', fields: lineSummary(a) });
    else {
      const fields = LINE_KEYS.filter((key) => !same(a[key], b[key])).map((key) => ({ key, before: a[key], after: b[key] }));
      if (fields.length > 0) rows.push({ index, kind: 'changed', fields });
    }
  }
  return rows;
}
