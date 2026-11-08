'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MONEY_COPY as COPY } from '@/lib/copy/money';
import { HIDE_BALANCES_COOKIE, HIDE_BALANCES_MAX_AGE } from '@/lib/navigation/balances-state';

/*
  "Hide balances": one global switch in the top bar masks every amount (<Money>) as ••••. It is kept per user in
  a cookie the server reads, so the first paint is already masked.
*/
const BalancesContext = createContext({ hidden: false, setHidden: () => {} });

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

/** Whether amounts are masked. */
export function useBalancesHidden() {
  return useContext(BalancesContext).hidden;
}

/** The switch: [hidden, toggle]. */
export function useGlobalBalances() {
  const { hidden, setHidden } = useContext(BalancesContext);
  return [hidden, () => setHidden(!hidden)];
}

// A toggle button: its name stays "Hide balances" and aria-pressed tells the state; the tooltip says what a click does.
export function HideBalancesToggle({ className }) {
  const [hidden, toggle] = useGlobalBalances();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={COPY.hideBalances} aria-pressed={hidden} className={className}>
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hidden ? COPY.showBalances : COPY.hideBalances}</TooltipContent>
    </Tooltip>
  );
}
