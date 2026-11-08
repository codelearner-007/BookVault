'use client';

import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { PageHeader } from '@/components/common/page';
import { getBankAccount } from '@/lib/services/bank-accounts.service';
import { BackButton, ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, DocumentSkeleton, useLoad } from './banking-parts';
import BankRegister, { registerParams } from './BankRegister';

// The account's current balance, the figure people open a register for.
function BalanceSummary({ account }) {
  return (
    <div className="mb-8 max-md:mb-6">
      <p className="text-sm text-muted-foreground">
        Balance as at <FormattedDate value={todayIso()} />
      </p>
      <Money value={account.actual_balance} tone="balance" className="mt-1 block text-title font-bold tracking-title" />
    </div>
  );
}

// ?tab=bank-and-cash-accounts&register=<id>[&from=&to=&p=N]: opened from a balance on the list.
export default function BankRegisterView({ businessId, accountId, page, range }) {
  const navigate = useTabNavigate(BANKING_TABS.bank);
  const { data: account, error } = useLoad(() => getBankAccount(businessId, accountId), [businessId, accountId]);
  if (!account) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  return (
    <div>
      <PageHeader
        title={account.name}
        description="Bank or Cash Account register"
        back={<BackButton onClick={() => navigate({})} />}
        className="mb-5 max-md:mb-4"
      />
      <BalanceSummary account={account} />
      <BankRegister
        businessId={businessId}
        accountId={account.id}
        page={page}
        range={range}
        onChange={(next) => navigate({ register: account.id, ...registerParams(next) })}
      />
    </div>
  );
}
