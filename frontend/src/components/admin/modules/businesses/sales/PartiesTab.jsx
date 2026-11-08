'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import PartiesList from './PartiesList';
import PartyForm from './PartyForm';
import PartyView from './PartyView';

// ?tab=customers|suppliers  list (&q &p) · &new=1 · &edit=<id> · &view=<id> (&p pages its transactions)
// side: the TRADE_SIDES entry (customers or suppliers).
export default function PartiesTab({ business, side }) {
  const route = useDocumentRoute(side.tab);
  const rights = useTabRights(side.tab);
  const searchParams = useSearchParams();

  if (route.isNew) return <PartyForm businessId={business.id} side={side} allowed={rights.create} />;
  if (route.editId) return <PartyForm key={route.editId} businessId={business.id} side={side} partyId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <PartyView key={route.viewId} businessId={business.id} side={side} partyId={route.viewId} page={route.page} rights={rights} />;
  return (
    <PartiesList
      businessId={business.id}
      side={side}
      page={route.page}
      search={route.active ? searchParams.get('q') ?? '' : ''}
      active={route.active}
      canCreate={rights.create}
    />
  );
}
