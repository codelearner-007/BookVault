import { stockDocumentsService } from '@/lib/services/inventory.service';
import { plainNumber } from '../sales/sales-documents';

/*
  Inventory (B6): the sidebar tabs, the access areas a picker needs, and one config per stock document
  (transfer, write-off, production order) naming its words, service, list columns and which parts apply.
    locations   'pair': From and To (transfer); 'one': an optional location (null = the default one)
    lineAccount write-off lines take an account (null = Inventory write-offs)
    production  finished item + qty, bill of materials and non-inventory cost lines
*/
export const INVENTORY_TABS = {
  items: 'inventory-items',
  transfers: 'inventory-transfers',
  writeOffs: 'inventory-write-offs',
  production: 'production-orders',
};

export const INVENTORY_AREAS = { items: 'inventory_items', kits: 'inventory_kits', locations: 'inventory_locations' };

export const STOCK_TYPES = { transfer: 'inventory_transfer', writeOff: 'inventory_write_off', production: 'production_order' };

export const DEFAULT_LOCATION_LABEL = 'Default Inventory Location';

const STOCK_STATUS = { draft: ['draft', 'Draft'], posted: ['ok', 'Posted'], void: ['void', 'Deleted'] };
const PRODUCTION_STATUS = { draft: ['draft', 'Draft'], completed: ['ok', 'Completed'], void: ['void', 'Deleted'] };

// A void that is not a ledger reversal: the stock just moves back.
const TRANSFER_VOID = { label: 'Delete', body: () => 'This removes the document and moves the stock back; you can restore it from History.', undo: true };

// List columns (keys rendered by StockDocumentsList), in Manager's order.
export const STOCK_DOCUMENTS = {
  [STOCK_TYPES.transfer]: {
    type: STOCK_TYPES.transfer,
    tab: INVENTORY_TABS.transfers,
    service: stockDocumentsService('inventory-transfers'),
    title: 'Inventory Transfer',
    plural: 'Inventory Transfers',
    noun: 'inventory transfer',
    locations: 'pair',
    voidCopy: TRANSFER_VOID,
    statuses: STOCK_STATUS,
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['from', 'From'], ['to', 'To'], ['description', 'Description'],
      ['items', 'Inventory items'],
    ],
  },
  [STOCK_TYPES.writeOff]: {
    type: STOCK_TYPES.writeOff,
    tab: INVENTORY_TABS.writeOffs,
    service: stockDocumentsService('inventory-write-offs'),
    title: 'Inventory Write-off',
    plural: 'Inventory Write-offs',
    noun: 'write-off',
    locations: 'one',
    lineAccount: true,
    statuses: STOCK_STATUS,
    columns: [['date', 'Date'], ['reference', 'Reference'], ['description', 'Description'], ['totalCost', 'Total cost']],
  },
  [STOCK_TYPES.production]: {
    type: STOCK_TYPES.production,
    tab: INVENTORY_TABS.production,
    service: stockDocumentsService('production-orders'),
    title: 'Production Order',
    plural: 'Production Orders',
    noun: 'production order',
    locations: 'one',
    production: true,
    statuses: PRODUCTION_STATUS,
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['description', 'Description'], ['finishedItem', 'Finished item'],
      ['qty', 'Qty'], ['totalCost', 'Total cost'], ['status', 'Status'],
    ],
  },
};

// "W1 · Widget" for an item, location or account record ({ code, name }).
export function recordLabel(record) {
  return record.code ? `${record.code} · ${record.name}` : record.name;
}

// An inventory item with what is on hand, so a picker shows what can be moved, used or sold.
export function inventoryItemLabel(item) {
  const name = recordLabel(item);
  return item.qty_on_hand === undefined ? name : `${name} (${plainNumber(item.qty_on_hand)} on hand)`;
}
