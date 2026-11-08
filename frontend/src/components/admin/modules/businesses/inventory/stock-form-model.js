import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { plainNumber } from '../sales/sales-documents';

/*
  Form state of a transfer, write-off or production order and the request body built from it, field by field
  (strict API bodies). Quantities and amounts stay text; the server computes every cost.
*/
export function emptyStockLine() {
  return { key: crypto.randomUUID(), item_id: '', description: '', qty: '', account_id: '', amount: '' };
}

function linesFrom(lines) {
  return lines.map((line) => ({
    key: line.id,
    item_id: line.item_id ?? '',
    description: line.description ?? '',
    qty: plainNumber(line.qty),
    account_id: line.account_id ?? '',
    amount: toInputAmount(line.amount),
  }));
}

// A saved document (location_id is From on a transfer) or a new form with one empty line and no costs.
export function stockForm(doc) {
  const lines = linesFrom(doc?.lines ?? []);
  return {
    date: doc?.date ?? todayIso(),
    reference: doc?.reference ?? '',
    description: doc?.description ?? '',
    locationId: doc?.location_id ?? '',
    toLocationId: doc?.to_location_id ?? '',
    finishedItemId: doc?.finished_item_id ?? '',
    qty: plainNumber(doc?.qty),
    lines: lines.length > 0 ? lines : [emptyStockLine()],
    costs: linesFrom(doc?.costs ?? []),
  };
}

const isBlankLine = (line) => !line.item_id && !line.qty.trim() && !line.description.trim() && !line.account_id;
const isBlankCost = (line) => !line.account_id && !line.amount.trim() && !line.description.trim();

// The typed decimal when it is more than zero (a comparison only, no arithmetic), else null.
function positive(text) {
  const value = parseAmount(text);
  return value !== null && Number(value) > 0 ? value : null;
}

function validate(form, lines, costs, config) {
  if (!form.date) return 'Date is required.';
  if (config.locations === 'pair' && (!form.locationId || !form.toLocationId)) return 'Choose the From and To inventory locations.';
  if (config.locations === 'pair' && form.locationId === form.toLocationId) return 'Choose two different inventory locations.';
  if (config.production && !form.finishedItemId) return 'Choose the finished item.';
  if (config.production && !positive(form.qty)) return 'The qty to produce must be more than zero.';
  if (lines.length === 0) return 'Add at least one line.';
  if (lines.some((line) => !line.item_id)) return 'Choose an item on every line.';
  if (lines.some((line) => !positive(line.qty))) return 'Every line needs a qty more than zero, for example 2.';
  if (costs.some((line) => !line.account_id || !positive(line.amount))) return 'Every cost line needs an account and an amount more than zero.';
  return null;
}

const text = (value) => value.trim() || null;

function typeFields(form, lines, costs, config) {
  if (config.locations === 'pair') {
    return {
      from_location_id: form.locationId,
      to_location_id: form.toLocationId,
      lines: lines.map((line) => ({ item_id: line.item_id, description: text(line.description), qty: positive(line.qty) })),
    };
  }
  const location = { location_id: form.locationId || null };
  if (config.production) {
    return {
      ...location,
      finished_item_id: form.finishedItemId,
      qty: positive(form.qty),
      lines: lines.map((line) => ({ item_id: line.item_id, qty: positive(line.qty) })),
      costs: costs.map((line) => ({ account_id: line.account_id, description: text(line.description), amount: positive(line.amount) })),
    };
  }
  return {
    ...location,
    lines: lines.map((line) => ({
      item_id: line.item_id, qty: positive(line.qty), account_id: line.account_id || null, description: text(line.description),
    })),
  };
}

// Field-by-field create / update body; returns { error } when the form cannot be sent.
export function buildStockBody(form, config) {
  const lines = form.lines.filter((line) => !isBlankLine(line));
  const costs = form.costs.filter((line) => !isBlankCost(line));
  const error = validate(form, lines, costs, config);
  if (error) return { error };
  return {
    body: {
      date: form.date,
      reference: text(form.reference),
      description: text(form.description),
      ...typeFields(form, lines, costs, config),
    },
  };
}
