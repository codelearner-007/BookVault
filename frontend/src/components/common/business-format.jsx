'use client';

import { createContext, useContext, useMemo } from 'react';
import { ISO_DATE, formatDate } from '@/lib/utils/dates';
import { numberLocale } from '@/lib/utils/money';

/*
  How the current business writes dates and amounts (GET /businesses/{id} `format`: date_format,
  number_format, decimal_places, currency_code). The shell provides the open business's format; a page that
  shows several businesses (the dashboard) wraps each one in its own FormatProvider.
*/
const MONEY_DECIMALS = 2;
const DEFAULT_FORMAT = toDisplayFormat(null);
const FormatContext = createContext(DEFAULT_FORMAT);

/** The API's format record as what the formatters need. */
export function toDisplayFormat(raw) {
  return {
    dateFormat: raw?.date_format || ISO_DATE,
    numberLocale: numberLocale(raw?.number_format),
    decimals: raw?.decimal_places ?? MONEY_DECIMALS,
    currencyCode: raw?.currency_code ?? null,
  };
}

export function FormatProvider({ format, children }) {
  const value = useMemo(() => toDisplayFormat(format), [format]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export function useBusinessFormat() {
  return useContext(FormatContext);
}

const QTY_MAX_DECIMALS = 4;

/** A quantity in the business number format, with only the decimals it needs. */
export function Quantity({ value, className }) {
  const { numberLocale: locale } = useBusinessFormat();
  if (value === null || value === undefined || value === '') return null;
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: QTY_MAX_DECIMALS }).format(String(value));
  return <span className={className}>{text}</span>;
}

/** An ISO date in the business date format, as a <time> element. */
export function FormattedDate({ value, className }) {
  const { dateFormat } = useBusinessFormat();
  if (!value) return null;
  return <time dateTime={value} className={className}>{formatDate(value, dateFormat)}</time>;
}
