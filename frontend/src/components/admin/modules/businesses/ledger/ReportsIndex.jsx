'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ListCard, PageHeader } from '@/components/common/page';
import { REPORTS_TAB } from './ledger-parts';

export const REPORTS = {
  trialBalance: 'trial-balance',
  glTransactions: 'general-ledger-transactions',
};

// Manager's Reports index, limited to the reports BookVault has built (General Ledger group).
const GROUPS = [
  {
    key: 'general-ledger',
    label: 'General Ledger',
    reports: [
      { key: REPORTS.trialBalance, label: 'Trial Balance' },
      { key: REPORTS.glTransactions, label: 'General Ledger Transactions' },
    ],
  },
];

export default function ReportsIndex() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Reports" />
      {GROUPS.map((group) => (
        <section key={group.key} aria-labelledby={`reports-${group.key}`} className="mb-6">
          <h2 id={`reports-${group.key}`} className="label-caps mb-2 px-1">{group.label}</h2>
          <ListCard>
            <ul>
              {group.reports.map((report) => (
                <li key={report.key}>
                  <Link
                    href={`?tab=${REPORTS_TAB}&report=${report.key}`}
                    className="flex h-row items-center justify-between rounded-control px-4 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {report.label}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </ListCard>
        </section>
      ))}
    </div>
  );
}
