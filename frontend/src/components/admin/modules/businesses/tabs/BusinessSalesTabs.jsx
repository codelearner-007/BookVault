'use client';

import CustomersTab from '../sales/CustomersTab';
import LateFeesTab from '../sales/LateFeesTab';
import { DOC_TYPES } from '../sales/sales-documents';
import TradeDocumentsTab from '../sales/TradeDocumentsTab';

/* The Sales sidebar tabs (B4): customers, the five trade documents and late payment fees. */

export function BusinessCustomers({ business }) {
  return <CustomersTab business={business} />;
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
