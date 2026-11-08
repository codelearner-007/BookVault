import { format, isValid, parse, parseISO } from 'date-fns';

// Dates travel as ISO (yyyy-MM-dd); people read and type them in the business's date format
// (business_format.date_format, date-fns tokens such as 'dd/MM/yyyy'). ISO is the fallback.
export const ISO_DATE = 'yyyy-MM-dd';
const MIN_YEAR = 1000;
const SEPARATORS = /[./\-\s]+/g;

function toDate(value) {
  if (value instanceof Date) return value;
  return parseISO(String(value));
}

/** An API date ("2026-11-08") or timestamp, written in the business date format. */
export function formatDate(value, pattern = ISO_DATE) {
  if (!value) return '';
  const date = toDate(value);
  if (!isValid(date)) return String(value);
  try {
    return format(date, pattern || ISO_DATE);
  } catch {
    return format(date, ISO_DATE);
  }
}

/** A Date as the ISO date the API takes. */
export function toIsoDate(date) {
  return format(date, ISO_DATE);
}

/** An ISO date as a local Date (no time-zone shift), or undefined. */
export function isoToDate(value) {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

function separatorOf(pattern) {
  return pattern.match(/[^A-Za-z]/)?.[0] ?? '/';
}

function tryParse(text, pattern) {
  try {
    const date = parse(text, pattern, new Date());
    return isValid(date) && date.getFullYear() >= MIN_YEAR ? date : null;
  } catch {
    return null;
  }
}

/**
 * Typed text as an ISO date, read in the business format. Any of . / - or space separates the parts,
 * a two-digit year is accepted, and an ISO date always works. Returns null when the text is not a date.
 */
export function parseDateInput(text, pattern = ISO_DATE) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) ? tryParse(trimmed, ISO_DATE) : null;
  if (iso) return toIsoDate(iso);
  const usable = pattern || ISO_DATE;
  const normalized = trimmed.replace(SEPARATORS, separatorOf(usable));
  const date = tryParse(normalized, usable) ?? tryParse(normalized, usable.replace('yyyy', 'yy'));
  return date ? toIsoDate(date) : null;
}
