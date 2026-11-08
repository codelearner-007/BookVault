'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getSuspenseBalance, getSuspenseEntries } from '@/lib/services/suspense.service';
import { formatMoney } from '@/lib/utils/money';

export default function BusinessSuspense({ business, onBack }) {
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entriesData, balanceData] = await Promise.all([
        getSuspenseEntries(business.id),
        getSuspenseBalance(business.id),
      ]);
      setEntries(entriesData.items);
      setBalance(balanceData.suspense_balance);
    } catch {
      setEntries([]);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [business.id]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${parseInt(d)}/${parseInt(m)}/${y}`;
  }

  function formatPaidBy(entry) {
    if (entry.paid_by_other) return entry.paid_by_other;
    if (entry.paid_by_contact_id) return `${entry.paid_by_contact_type ?? 'Contact'}: ${entry.paid_by_contact_id}`;
    return '—';
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-semibold text-foreground">Suspense Account</h2>
        <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
          {entries.length}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        These transactions have no account assigned. Edit each receipt to assign an account and clear the suspense balance.
      </p>

      <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Date</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Reference</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">Paid By</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No suspense entries. All transactions have accounts assigned.
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <tr key={`${entry.receipt_id}-${i}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-foreground border-r border-border whitespace-nowrap">{formatDate(entry.receipt_date)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">{entry.receipt_reference || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground border-r border-border whitespace-nowrap">{formatPaidBy(entry)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground whitespace-nowrap">
                    {formatMoney(entry.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Total Suspense</td>
                <td className="px-4 py-2 text-right text-sm font-semibold text-foreground tabular-nums">
                  {formatMoney(balance)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
