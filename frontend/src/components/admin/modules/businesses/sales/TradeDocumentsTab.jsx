'use client';

import { useSearchParams } from 'next/navigation';
import { useDocumentRoute, useTabRights } from '../banking/banking-parts';
import EarlyPaymentDiscounts from './EarlyPaymentDiscounts';
import { DOC_TYPES, TRADE_DOCUMENTS } from './sales-documents';
import TradeDocumentForm from './TradeDocumentForm';
import TradeDocumentsList from './TradeDocumentsList';
import TradeDocumentView from './TradeDocumentView';

// ?tab=sales-quotes|sales-orders|sales-invoices|credit-notes|delivery-notes
//   list (&q=search &p=N) · &new=1 [&from=<id>&from_type=<type>] [&starting_balance=1] · &edit=<id> · &view=<id>
//   sales-invoices also: &discounts=1 (early payment discounts available)
// The server enforces every right; these only hide what the user cannot do.
export default function TradeDocumentsTab({ business, type }) {
  const config = TRADE_DOCUMENTS[type];
  const route = useDocumentRoute(config.tab);
  const rights = useTabRights(config.tab);
  const searchParams = useSearchParams();
  const param = (key) => (route.active ? searchParams.get(key) : null);

  if (route.isNew) {
    const fromId = param('from');
    const fromType = param('from_type');
    const copyFrom = fromId && TRADE_DOCUMENTS[fromType] ? { id: fromId, type: fromType } : null;
    const startingBalance = type === DOC_TYPES.invoice && !!param('starting_balance');
    return (
      <TradeDocumentForm
        key={`${fromId}:${startingBalance}`}
        businessId={business.id}
        config={config}
        allowed={rights.create}
        copyFrom={copyFrom}
        startingBalance={startingBalance}
      />
    );
  }
  if (route.editId) return <TradeDocumentForm key={route.editId} businessId={business.id} config={config} docId={route.editId} allowed={rights.edit} />;
  if (route.viewId) return <TradeDocumentView key={route.viewId} business={business} config={config} docId={route.viewId} rights={rights} />;
  if (type === DOC_TYPES.invoice && param('discounts')) return <EarlyPaymentDiscounts businessId={business.id} page={route.page} />;
  const search = param('q') ?? '';
  return (
    <TradeDocumentsList
      businessId={business.id}
      config={config}
      page={route.page}
      search={search}
      active={route.active}
      canCreate={rights.create}
    />
  );
}
