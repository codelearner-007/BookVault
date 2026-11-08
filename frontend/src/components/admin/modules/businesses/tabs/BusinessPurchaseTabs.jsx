'use client';

import PartiesTab from '../sales/PartiesTab';
import { DOC_TYPES, TRADE_SIDES } from '../sales/sales-documents';
import TradeDocumentsTab from '../sales/TradeDocumentsTab';

/* The Purchases sidebar tabs (B5): suppliers and the five purchase documents, on the shared trade components. */

export function BusinessSuppliers({ business }) {
  return <PartiesTab business={business} side={TRADE_SIDES.purchases} />;
}

export function BusinessPurchaseQuotes({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.purchaseQuote} />;
}

export function BusinessPurchaseOrders({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.purchaseOrder} />;
}

export function BusinessPurchaseInvoices({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.purchaseInvoice} />;
}

export function BusinessDebitNotes({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.debitNote} />;
}

export function BusinessGoodsReceipts({ business }) {
  return <TradeDocumentsTab business={business} type={DOC_TYPES.goodsReceipt} />;
}
