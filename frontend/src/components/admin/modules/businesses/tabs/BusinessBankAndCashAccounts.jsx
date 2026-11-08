'use client';

import BankAccountsList from '../banking/BankAccountsList';
import BankAccountView from '../banking/BankAccountView';
import { BANKING_TABS, useDocumentRoute, useTabRights } from '../banking/banking-parts';

// ?tab=bank-and-cash-accounts                list (&p=N)
//                            &view=<id>      the account, its balances and transactions (&p=N)
// New / Edit are dialogs. Starting balances live in Settings > Starting balances.
export default function BusinessBankAndCashAccounts({ business }) {
  const route = useDocumentRoute(BANKING_TABS.bank);
  const rights = useTabRights(BANKING_TABS.bank);
  if (route.viewId) {
    return <BankAccountView key={route.viewId} businessId={business.id} accountId={route.viewId} page={route.page} rights={rights} />;
  }
  return <BankAccountsList businessId={business.id} page={route.page} active={route.active} canCreate={rights.create} />;
}
