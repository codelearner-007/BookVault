'use client';

import InventoryItemsTab from '../inventory/InventoryItemsTab';
import { STOCK_TYPES } from '../inventory/inventory-documents';
import StockDocumentsTab from '../inventory/StockDocumentsTab';

/* The Inventory sidebar tabs (B6): inventory items and the three stock documents. */

export function BusinessInventoryItems({ business }) {
  return <InventoryItemsTab business={business} />;
}

export function BusinessInventoryTransfers({ business }) {
  return <StockDocumentsTab business={business} type={STOCK_TYPES.transfer} />;
}

export function BusinessInventoryWriteOffs({ business }) {
  return <StockDocumentsTab business={business} type={STOCK_TYPES.writeOff} />;
}

export function BusinessProductionOrders({ business }) {
  return <StockDocumentsTab business={business} type={STOCK_TYPES.production} />;
}
