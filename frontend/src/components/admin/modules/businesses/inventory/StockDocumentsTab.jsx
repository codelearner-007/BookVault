'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import { STOCK_DOCUMENTS } from './inventory-documents';
import StockDocumentForm from './StockDocumentForm';
import StockDocumentsList from './StockDocumentsList';
import StockDocumentView from './StockDocumentView';

// ?tab=inventory-transfers|inventory-write-offs|production-orders
//   list (&q=search &p=N) · &new=1 · &edit=<id> · &view=<id>
// The server enforces every right; these only hide what the user cannot do.
export default function StockDocumentsTab({ business, type }) {
  const config = STOCK_DOCUMENTS[type];
  const route = useDocumentRoute(config.tab);
  const rights = useTabRights(config.tab);
  const searchParams = useSearchParams();

  if (route.isNew) return <StockDocumentForm businessId={business.id} config={config} allowed={rights.create} />;
  if (route.editId) return <StockDocumentForm key={route.editId} businessId={business.id} config={config} docId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <StockDocumentView key={route.viewId} business={business} config={config} docId={route.viewId} rights={rights} />;
  return (
    <StockDocumentsList
      businessId={business.id}
      config={config}
      page={route.page}
      search={(route.active && searchParams.get('q')) || ''}
      active={route.active}
      canCreate={rights.create}
    />
  );
}
