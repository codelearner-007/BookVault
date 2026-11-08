'use client';

import { BANKING_TABS, useDocumentRoute, useTabRights } from '../banking/banking-parts';
import TransferForm from '../banking/TransferForm';
import TransfersList from '../banking/TransfersList';
import TransferView from '../banking/TransferView';

// ?tab=inter-account-transfers [&p=N | &new=1 | &edit=<id> | &view=<id>]
export default function BusinessInterAccountTransfers({ business }) {
  const route = useDocumentRoute(BANKING_TABS.transfers);
  const rights = useTabRights(BANKING_TABS.transfers);

  if (route.isNew) return <TransferForm businessId={business.id} allowed={rights.create} />;
  if (route.editId) return <TransferForm key={route.editId} businessId={business.id} docId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <TransferView key={route.viewId} business={business} docId={route.viewId} rights={rights} />;
  return <TransfersList businessId={business.id} page={route.page} active={route.active} canCreate={rights.create} canEdit={rights.edit} />;
}
