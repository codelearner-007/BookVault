'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  addYears,
  endOfMonth,
  format,
  isSameDay,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_RANGE_COPY as COPY } from '@/lib/copy/date-range';
import { cn } from '@/lib/utils';

const ISO_DATE = 'yyyy-MM-dd';
const TWO_MONTHS_QUERY = '(min-width: 48rem)';
const PRESET_KEYS = ['today', 'last7', 'thisMonth', 'lastMonth', 'thisFinancialYear'];

function presetRange(key, financialYearStartMonth) {
  const today = startOfDay(new Date());
  if (key === 'today') return { from: today, to: today };
  if (key === 'last7') return { from: subDays(today, 6), to: today };
  if (key === 'thisMonth') return { from: startOfMonth(today), to: endOfMonth(today) };
  if (key === 'lastMonth') {
    const lastMonth = subMonths(today, 1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
  }
  let yearStart = new Date(today.getFullYear(), financialYearStartMonth - 1, 1);
  if (yearStart > today) yearStart = addYears(yearStart, -1);
  return { from: yearStart, to: subDays(addYears(yearStart, 1), 1) };
}

function toDate(isoDate) {
  if (!isoDate) return undefined;
  const date = parseISO(isoDate);
  return isValid(date) ? date : undefined;
}

function toRange(value) {
  const from = toDate(value?.from);
  return from ? { from, to: toDate(value?.to) } : undefined;
}

function matchingPreset(range, financialYearStartMonth) {
  if (!range?.from || !range?.to) return 'custom';
  const match = PRESET_KEYS.find((key) => {
    const preset = presetRange(key, financialYearStartMonth);
    return isSameDay(preset.from, range.from) && isSameDay(preset.to, range.to);
  });
  return match ?? 'custom';
}

function formatRange(range, locale) {
  if (!range?.from) return null;
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  if (!range.to || isSameDay(range.from, range.to)) return formatter.format(range.from);
  return formatter.formatRange(range.from, range.to);
}

function subscribeToWidth(onChange) {
  const query = window.matchMedia(TWO_MONTHS_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useTwoMonths() {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(TWO_MONTHS_QUERY).matches,
    () => false
  );
}

function PresetList({ active, onSelect }) {
  return (
    <div
      role="group"
      aria-label={COPY.presetsLabel}
      className="flex gap-1 overflow-x-auto border-b border-border p-2 md:w-44 md:flex-col md:overflow-visible md:border-b-0 md:border-e"
    >
      {[...PRESET_KEYS, 'custom'].map((key) => (
        <Button
          key={key}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={active === key}
          onClick={() => onSelect(key)}
          className={cn(
            'shrink-0 justify-start rounded-menu-item font-medium md:w-full',
            active === key && 'bg-accent text-foreground'
          )}
        >
          {COPY.presets[key]}
        </Button>
      ))}
    </div>
  );
}

/**
 * Shared date-range picker. Controlled: value and onChange use { from, to } as ISO dates
 * (yyyy-MM-dd), or { from: null, to: null } when cleared.
 * locale: an Intl tag (the business/user date format); financialYearStartMonth: 1-12.
 */
export function DateRangePicker({
  value,
  onChange,
  locale,
  financialYearStartMonth = 1,
  placeholder = COPY.placeholder,
  className,
  id,
}) {
  const twoMonths = useTwoMonths();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(undefined);
  const [month, setMonth] = useState(undefined);
  const [preset, setPreset] = useState('custom');

  const committed = toRange(value);
  const label = formatRange(committed, locale);

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      setDraft(committed);
      setMonth(committed?.from ?? new Date());
      setPreset(matchingPreset(committed, financialYearStartMonth));
    }
    setOpen(nextOpen);
  };

  const handlePreset = (key) => {
    setPreset(key);
    if (key === 'custom') return;
    const range = presetRange(key, financialYearStartMonth);
    setDraft(range);
    setMonth(range.from);
  };

  const handleSelect = (range) => {
    setDraft(range);
    setPreset(matchingPreset(range, financialYearStartMonth));
  };

  const commit = (range) => {
    onChange({
      from: range?.from ? format(range.from, ISO_DATE) : null,
      to: range?.from ? format(range.to ?? range.from, ISO_DATE) : null,
    });
    setOpen(false);
  };

  const draftLabel = formatRange(draft, locale);
  const summary = draft?.from && !draft.to ? `${draftLabel} · ${COPY.pickEnd}` : draftLabel;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn('w-full justify-start font-medium', !label && 'text-muted-foreground', className)}
        >
          <CalendarIcon aria-hidden />
          <span className="truncate">{label ?? placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        aria-label={COPY.dialogLabel}
        className="w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-menu bg-popover p-0 shadow-pop"
      >
        <div className="flex flex-col md:flex-row">
          <PresetList active={preset} onSelect={handlePreset} />
          <div className="flex flex-col">
            <Calendar
              mode="range"
              autoFocus
              month={month}
              onMonthChange={setMonth}
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={twoMonths ? 2 : 1}
              className="p-3"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <span aria-live="polite" className="text-sm text-muted-foreground">
                {summary ?? COPY.nothingSelected}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => commit(undefined)}>
                  {COPY.clear}
                </Button>
                <Button type="button" size="sm" disabled={!draft?.from} onClick={() => commit(draft)}>
                  {COPY.apply}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
