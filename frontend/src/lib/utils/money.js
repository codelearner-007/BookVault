const DEFAULT_LOCALE = 'en-US';
const MONEY_DECIMALS = 2;

/**
 * Formats a money value from the API (decimal string such as "100.0000") for display.
 * numberFormat: an Intl locale tag (the business number format), defaults to en-US.
 * Never does arithmetic on the value; Intl rounds the decimal string itself.
 */
export function formatMoney(value, numberFormat = DEFAULT_LOCALE, decimals = MONEY_DECIMALS) {
  if (value === null || value === undefined || value === '') return '';
  const formatter = new Intl.NumberFormat(numberFormat || DEFAULT_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return formatter.format(String(value));
}

// business_format.number_format patterns (the country templates' values) and the Intl locale that writes them.
const NUMBER_FORMAT_LOCALES = {
  '1,234.56': 'en-US',
  '1.234,56': 'de-DE',
  '1 234,56': 'fr-FR',
  "1'234.56": 'de-CH',
};

/** A formatter for one business's amounts: its number format and its base currency's decimal places. */
export function businessMoneyFormatter({ number_format: pattern, decimal_places: decimals }) {
  const locale = NUMBER_FORMAT_LOCALES[pattern] ?? DEFAULT_LOCALE;
  return (value) => formatMoney(value, locale, decimals ?? MONEY_DECIMALS);
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
