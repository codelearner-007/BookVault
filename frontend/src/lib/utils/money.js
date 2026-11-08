const DEFAULT_LOCALE = 'en-US';
const MONEY_DECIMALS = 2;

/**
 * Formats a money value from the API (decimal string such as "100.0000") for display.
 * numberFormat: an Intl locale tag (the business number format), defaults to en-US.
 * Never does arithmetic on the value; Intl rounds the decimal string itself.
 */
export function formatMoney(value, numberFormat = DEFAULT_LOCALE) {
  if (value === null || value === undefined || value === '') return '';
  const formatter = new Intl.NumberFormat(numberFormat || DEFAULT_LOCALE, {
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  });
  return formatter.format(String(value));
}

const API_SCALE = 4; // money columns are numeric(19,4)

/**
 * Exact sum of decimal money values (API strings or rounded numbers), as a decimal string.
 * Uses integer units of 10^-4 so totals never pick up float drift.
 */
export function sumMoney(values) {
  let units = 0n;
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const text = String(value).trim();
    const [whole, fraction = ''] = text.replace(/^[-+]/, '').split('.');
    const magnitude = BigInt((whole || '0') + fraction.padEnd(API_SCALE, '0').slice(0, API_SCALE));
    units += text.startsWith('-') ? -magnitude : magnitude;
  }
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(API_SCALE + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -API_SCALE)}.${digits.slice(-API_SCALE)}`;
}
