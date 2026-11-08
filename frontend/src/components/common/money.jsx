'use client';

import { cn } from '@/lib/utils';
import { MONEY_COPY as COPY } from '@/lib/copy/money';
import { absoluteAmount, formatMoney, isNegativeAmount } from '@/lib/utils/money';
import { useBalancesHidden } from './balances';
import { useBusinessFormat } from './business-format';

/*
  The one way an amount reaches the screen: the business's number format and decimals, tabular figures, and
  •••• while balances are hidden. Alignment belongs to the
  container (a `money` column, a `num` cell).
    zero      'show' | 'muted' (dimmed) | 'blank' (nothing)
    absolute  drop the sign when words carry the direction ("150.00 to allocate")
    tone      direction colour, an allowed status use (DESIGN.md "Money direction"):
              'in' money received, normal foreground; 'out' money paid, the bad (red) token;
              'balance' a running or current balance: semibold, a step larger, red when negative;
              'auto' red when negative; none (default) leaves the inherited colour.
*/
const TONE_CLASS = {
  in: 'text-foreground',
  out: 'text-bad',
  balance: 'text-md font-semibold',
  auto: '',
};

function toneClass(tone, value) {
  if (!tone) return '';
  const negative = (tone === 'balance' || tone === 'auto') && isNegativeAmount(value);
  return cn(TONE_CLASS[tone], negative && 'text-bad');
}
const ZERO_PATTERN = /^[-+]?0*(\.0*)?$/;

function isZero(value) {
  return ZERO_PATTERN.test(String(value).trim());
}

/** A formatter honouring the business format and the hidden state, for text that is not a <Money> element. */
export function useMoneyFormatter() {
  const { numberLocale, decimals } = useBusinessFormat();
  const hidden = useBalancesHidden();
  return (value, { absolute = false } = {}) => {
    if (value === null || value === undefined || value === '') return '';
    if (hidden) return COPY.mask;
    return formatMoney(absolute ? absoluteAmount(value) : value, numberLocale, decimals);
  };
}

export function Money({ value, zero = 'show', absolute = false, tone, className }) {
  const format = useMoneyFormatter();
  const hidden = useBalancesHidden();
  if (value === null || value === undefined || value === '') return null;
  const zeroValue = isZero(value);
  if (zeroValue && zero === 'blank') return null;
  if (hidden) {
    return (
      <span className={cn('tabular-nums tracking-widest text-muted-foreground', tone === 'balance' && 'text-md', className)}>
        <span aria-hidden="true">{COPY.mask}</span>
        <span className="sr-only">{COPY.hiddenAmount}</span>
      </span>
    );
  }
  return (
    // A zero carries no direction: no tone colour.
    <span className={cn('tabular-nums', !zeroValue && toneClass(tone, value), zeroValue && zero === 'muted' && 'text-muted-foreground', className)}>
      {format(value, { absolute })}
    </span>
  );
}
