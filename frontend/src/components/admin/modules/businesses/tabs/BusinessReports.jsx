'use client';

import { useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { can } from '@/lib/navigation/access';
import GeneralLedgerTransactionsReport from '../ledger/GeneralLedgerTransactionsReport';
import { REPORTS_AREA, REPORTS_TAB } from '../ledger/ledger-parts';
import ReportsIndex, { REPORTS } from '../ledger/ReportsIndex';
import TrialBalanceReport from '../ledger/TrialBalanceReport';

const REPORT_COMPONENTS = {
  [REPORTS.trialBalance]: TrialBalanceReport,
  [REPORTS.glTransactions]: GeneralLedgerTransactionsReport,
};

// ?tab=reports lists the reports; &report=<key> opens one (its filters are query params too).
export default function BusinessReports({ business }) {
  const searchParams = useSearchParams();
  const { access } = useBusinessWorkspace();
  const active = searchParams.get('tab') === REPORTS_TAB;
  const Report = active ? REPORT_COMPONENTS[searchParams.get('report')] : null;

  if (!can(access, REPORTS_AREA)) {
    return (
      <>
        <PageHeader title="Reports" />
        <ListCard><EmptyState icon={Lock} title="You don't have access to reports." /></ListCard>
      </>
    );
  }
  return Report ? <Report businessId={business.id} /> : <ReportsIndex />;
}
