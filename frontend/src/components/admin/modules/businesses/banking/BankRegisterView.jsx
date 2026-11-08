'use client';

import { PageHeader } from '@/components/common/page';
import { getBankAccount } from '@/lib/services/bank-accounts.service';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { BANKING_TABS, DocumentSkeleton, useLoad } from './banking-parts';
import BankRegister, { registerParams } from './BankRegister';

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
