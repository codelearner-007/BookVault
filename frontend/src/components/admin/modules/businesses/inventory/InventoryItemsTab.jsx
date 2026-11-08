'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import CostCorrections from './CostCorrections';
import { INVENTORY_TABS } from './inventory-documents';
import InventoryItemForm from './InventoryItemForm';
import InventoryItemView from './InventoryItemView';
import InventoryItemsList from './InventoryItemsList';

// ?tab=inventory-items  list (&q=search &p=N) · &new=1 · &edit=<id> · &view=<id> (&p=N: movements page)
//   · &corrections=1 (&p=N): cost corrections
// The server enforces every right; these only hide what the user cannot do.
export default function InventoryItemsTab({ business }) {
  const route = useDocumentRoute(INVENTORY_TABS.items);
  const rights = useTabRights(INVENTORY_TABS.items);
  const searchParams = useSearchParams();
  const param = (key) => (route.active ? searchParams.get(key) : null);

  if (route.isNew) return <InventoryItemForm businessId={business.id} allowed={rights.create} />;
  if (route.editId) return <InventoryItemForm key={route.editId} businessId={business.id} itemId={route.editId} allowed={rights.edit} />;
  if (route.viewId) {
    return <InventoryItemView key={route.viewId} businessId={business.id} itemId={route.viewId} page={route.page} rights={rights} />;
  }
  if (param('corrections')) return <CostCorrections businessId={business.id} page={route.page} />;
  return (
    <InventoryItemsList
      businessId={business.id}
      page={route.page}
      search={param('q') ?? ''}
      active={route.active}
      canCreate={rights.create}
    />
  );
}
