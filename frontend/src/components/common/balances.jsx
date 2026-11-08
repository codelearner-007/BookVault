'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MONEY_COPY as COPY } from '@/lib/copy/money';
import { HIDE_BALANCES_COOKIE, HIDE_BALANCES_MAX_AGE } from '@/lib/navigation/balances-state';

/*
  "Hide balances": one global switch in the top bar masks every amount (<Money>) as ••••. It is kept per user in
  a cookie the server reads, so the first paint is already masked. A BalanceSection (dashboard card, Bank and
  Cash, Summary) has its own eye that reveals or hides just that section until the global switch changes.
*/
const BalancesContext = createContext({ hidden: false, setHidden: () => {} });
const SectionContext = createContext(null);

function persist(userId, hidden) {
  const value = hidden ? encodeURIComponent(userId) : '';
  const maxAge = hidden ? HIDE_BALANCES_MAX_AGE : 0;
  document.cookie = `${HIDE_BALANCES_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function BalancesProvider({ initialHidden = false, userId, children }) {
  const [hidden, setHiddenState] = useState(initialHidden);
  const setHidden = useCallback((next) => {
    setHiddenState(next);
    if (userId) persist(userId, next);
  }, [userId]);
  const value = useMemo(() => ({ hidden, setHidden }), [hidden, setHidden]);
  return <BalancesContext.Provider value={value}>{children}</BalancesContext.Provider>;
}

/** Whether amounts are masked here: the nearest section's choice, else the global switch. */
export function useBalancesHidden() {
  const global = useContext(BalancesContext).hidden;
  const section = useContext(SectionContext);
  return section ? section.hidden : global;
}

// A toggle button: its name stays "Hide balances…" and aria-pressed tells the state; the tooltip says what a click does.
function EyeButton({ hidden, onToggle, labels, size = 'icon-sm', className }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size={size} onClick={onToggle} aria-label={labels.hide} aria-pressed={hidden} className={className}>
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hidden ? labels.show : labels.hide}</TooltipContent>
    </Tooltip>
  );
}

/** The global switch: [hidden, toggle]. */
export function useGlobalBalances() {
  const { hidden, setHidden } = useContext(BalancesContext);
  return [hidden, () => setHidden(!hidden)];
}

/** The top bar's global eye. */
export function HideBalancesToggle({ className }) {
  const [hidden, toggle] = useGlobalBalances();
  return <EyeButton hidden={hidden} onToggle={toggle} labels={{ show: COPY.showBalances, hide: COPY.hideBalances }} className={className} />;
}

/**
 * A part of a page with its own eye. The override is remembered together with the global value it was made
 * under, so turning the global switch again applies everywhere (no effect needed to reset it).
 */
export function BalanceSection({ children }) {
  const global = useContext(BalancesContext).hidden;
  const [override, setOverride] = useState(null);
  const hidden = override && override.under === global ? override.hidden : global;
  const value = useMemo(() => ({ hidden, toggle: () => setOverride({ hidden: !hidden, under: global }) }), [hidden, global]);
  return <SectionContext.Provider value={value}>{children}</SectionContext.Provider>;
}

/** The eye of the enclosing BalanceSection; `name` completes its label ("Show balances in Summary"). */
export function SectionBalancesToggle({ name, className }) {
  const section = useContext(SectionContext);
  if (!section) return null;
  return (
    <EyeButton
      hidden={section.hidden}
      onToggle={(event) => { event.preventDefault(); event.stopPropagation(); section.toggle(); }}
      labels={{ show: COPY.showSection(name), hide: COPY.hideSection(name) }}
      className={className}
    />
  );
}
