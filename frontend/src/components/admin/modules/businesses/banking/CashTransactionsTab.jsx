'use client';

import { useDocumentRoute, useTabRights } from './banking-parts';
import { CASH_DIRECTIONS } from './cash-directions';
import CashTransactionForm from './CashTransactionForm';
import CashTransactionsList from './CashTransactionsList';
import CashTransactionView from './CashTransactionView';

// ?tab=receipts|payments           list (&p=N)
//                       &new=1     new document
//                       &edit=<id> edit a document
//                       &view=<id> view it and attachments
// The server enforces every right; these only hide what the user cannot do.
export default function CashTransactionsTab({ business, kind }) {
  const direction = CASH_DIRECTIONS[kind];
  const route = useDocumentRoute(direction.tab);
  const rights = useTabRights(direction.tab);

  if (route.isNew) return <CashTransactionForm businessId={business.id} direction={direction} allowed={rights.create} />;
  if (route.editId) {
    return <CashTransactionForm key={route.editId} businessId={business.id} direction={direction} docId={route.editId} allowed={rights.edit} />;
  }
  if (route.viewId) return <CashTransactionView key={route.viewId} business={business} direction={direction} docId={route.viewId} rights={rights} />;
  return <CashTransactionsList businessId={business.id} direction={direction} page={route.page} active={route.active} canCreate={rights.create} canEdit={rights.edit} />;
}
