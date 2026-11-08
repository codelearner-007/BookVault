'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import LateFeeForm from './LateFeeForm';
import LateFeeProposals from './LateFeeProposals';
import LateFeesList from './LateFeesList';
import LateFeeView from './LateFeeView';
import { SALES_TABS } from './sales-documents';

// ?tab=late-payment-fees  list (&p) · &new=1 · &edit=<id> · &view=<id> · &proposals=1 (fees to charge)
export default function LateFeesTab({ business }) {
  const route = useDocumentRoute(SALES_TABS.lateFees);
  const rights = useTabRights(SALES_TABS.lateFees);
  const searchParams = useSearchParams();

  if (route.isNew) return <LateFeeForm businessId={business.id} allowed={rights.create} />;
  if (route.editId) return <LateFeeForm key={route.editId} businessId={business.id} feeId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <LateFeeView key={route.viewId} business={business} feeId={route.viewId} rights={rights} />;
  if (route.active && searchParams.get('proposals') && rights.create) return <LateFeeProposals businessId={business.id} />;
  return <LateFeesList businessId={business.id} page={route.page} active={route.active} canCreate={rights.create} canEdit={rights.edit} />;
}
