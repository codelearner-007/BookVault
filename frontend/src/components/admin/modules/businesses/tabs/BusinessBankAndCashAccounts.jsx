'use client';

import { useSearchParams } from 'next/navigation';
import BankAccountsList from '../banking/BankAccountsList';
import BankAccountView from '../banking/BankAccountView';
import BankRegisterView from '../banking/BankRegisterView';
import { BANKING_TABS, useDocumentRoute, useTabRights } from '../banking/banking-parts';

// ?tab=bank-and-cash-accounts                list (&p=N)
//                            &view=<id>      the account, its balances and register (&from=&to=&p=N)
//                            &register=<id>  the register alone, opened from a balance (&from=&to=&p=N)
// New / Edit are dialogs. Starting balances live in Settings > Starting balances.
export default function BusinessBankAndCashAccounts({ business }) {
  const route = useDocumentRoute(BANKING_TABS.bank);
  const rights = useTabRights(BANKING_TABS.bank);
  const searchParams = useSearchParams();
  const param = (key) => (route.active ? searchParams.get(key) : null);
  const range = { from: param('from'), to: param('to') };
  const registerId = param('register');
  if (registerId) {
    return <BankRegisterView key={registerId} businessId={business.id} accountId={registerId} page={route.page} range={range} />;
  }
  if (route.viewId) {
    return (
      <BankAccountView
        key={route.viewId}
        businessId={business.id}
        accountId={route.viewId}
        page={route.page}
        range={range}
        rights={rights}
      />
    );
  }
  return <BankAccountsList businessId={business.id} page={route.page} active={route.active} canCreate={rights.create} />;
}
