'use client';

import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import { SALES_TABS } from './sales-documents';
import WhtReceiptForm from './WhtReceiptForm';
import WhtReceiptsList from './WhtReceiptsList';
import WhtReceiptView from './WhtReceiptView';

// ?tab=withholding-tax-receipts  list (&p) · &new=1 · &edit=<id> · &view=<id>
export default function WhtReceiptsTab({ business }) {
  const route = useDocumentRoute(SALES_TABS.whtReceipts);
  const rights = useTabRights(SALES_TABS.whtReceipts);

  if (route.isNew) return <WhtReceiptForm businessId={business.id} allowed={rights.create} />;
  if (route.editId) return <WhtReceiptForm key={route.editId} businessId={business.id} receiptId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <WhtReceiptView key={route.viewId} business={business} receiptId={route.viewId} rights={rights} />;
  return <WhtReceiptsList businessId={business.id} page={route.page} active={route.active} canCreate={rights.create} canEdit={rights.edit} />;
}
