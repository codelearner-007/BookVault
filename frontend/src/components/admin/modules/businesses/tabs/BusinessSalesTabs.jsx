'use client';

import LateFeesTab from '../sales/LateFeesTab';
import PartiesTab from '../sales/PartiesTab';
import { DOC_TYPES, TRADE_SIDES } from '../sales/sales-documents';
import TradeDocumentsTab from '../sales/TradeDocumentsTab';
import WhtReceiptsTab from '../sales/WhtReceiptsTab';

/* The Sales sidebar tabs (B4): customers, the five trade documents and late payment fees. */

export function BusinessCustomers({ business }) {
  return <PartiesTab business={business} side={TRADE_SIDES.sales} />;
}

export function BusinessSalesQuotes({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.quote} />;
}

export function BusinessSalesOrders({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.order} />;
}

export function BusinessSalesInvoices({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.invoice} />;
}

export function BusinessCreditNotes({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.creditNote} />;
}

export function BusinessDeliveryNotes({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.deliveryNote} />;
}

export function BusinessLatePaymentFees({ business }) {
  return <LateFeesTab business={business} />;
}

export function BusinessWithholdingTaxReceipts({ business }) {
  return <WhtReceiptsTab business={business} />;
}
