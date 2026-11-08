'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_COPY as COPY } from '@/lib/copy/money';
import { formatDate, isoToDate, parseDateInput, toIsoDate } from '@/lib/utils/dates';
import { useBusinessFormat } from './business-format';

const FULL_YEAR = /\d{4}/;

/**
 * One date, the single-date sibling of DateRangePicker. Typed in the business date format (any of . / - or space
 * between the parts, an ISO date always works) or picked from the Nightglass calendar. value / onChange use
 * ISO dates (yyyy-MM-dd); text that is not a date reports '' and stays marked invalid until fixed.
 */
export function DatePicker({ id, value, onChange, disabled, required, className, 'aria-label': ariaLabel }) {
  const { dateFormat } = useBusinessFormat();
  const [open, setOpen] = useState(false);
  // What the person is typing; null shows the formatted value.
  const [draft, setDraft] = useState(null);
  const shown = draft ?? formatDate(value, dateFormat);
  const invalid = draft !== null && draft.trim() !== '' && !parseDateInput(draft, dateFormat);

  function type(text) {
    setDraft(text);
    // A complete date (four-digit year) applies at once; anything shorter waits for blur.
    const iso = FULL_YEAR.test(text) ? parseDateInput(text, dateFormat) : null;
    if (iso && iso !== value) onChange(iso);
  }

  function commit() {
    if (draft === null) return;
    const iso = parseDateInput(draft, dateFormat);
    if (iso) {
      if (iso !== value) onChange(iso);
      setDraft(null);
    } else if (draft.trim() === '') {
      onChange('');
      setDraft(null);
    } else if (value) {
      onChange('');
    }
  }

  function pick(date) {
    setOpen(false);
    setDraft(null);
    if (date) onChange(toIsoDate(date));
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        value={shown}
        onChange={(event) => type(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
        placeholder={dateFormat.toLowerCase()}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? COPY.invalid(formatDate(new Date(), dateFormat)) : undefined}
        autoComplete="off"
        inputMode="numeric"
        disabled={disabled}
        required={required}
        className="pe-11 tabular-nums"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={ariaLabel ? `${COPY.openCalendar}: ${ariaLabel}` : COPY.openCalendar}
            // Centred with inset + auto margins, not a translate: the button's press offset would undo a translate.
            className="absolute inset-y-0 end-1 my-auto"
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" collisionPadding={12} className="w-auto rounded-menu p-3">
          <Calendar mode="single" autoFocus selected={isoToDate(value)} defaultMonth={isoToDate(value)} onSelect={pick} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
