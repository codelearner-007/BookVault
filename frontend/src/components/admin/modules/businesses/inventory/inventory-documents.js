import { stockDocumentsService } from '@/lib/services/inventory.service';
import { DOCUMENT_TYPE_LABELS, documentHref } from '../banking/banking-parts';
import { plainNumber } from '../sales/sales-documents';

/*
  Inventory (B6): the sidebar tabs, the access areas a picker needs, and one config per stock document
  (transfer, write-off, production order) naming its words, service, list columns and which parts apply.
    posts       hits the ledger: Transaction Journal on the view (a transfer only moves stock)
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

const STOCK_STATUS = { draft: ['draft', 'Draft'], posted: ['ok', 'Posted'], void: ['void', 'Void'] };
const PRODUCTION_STATUS = { draft: ['draft', 'Draft'], completed: ['ok', 'Completed'], void: ['void', 'Void'] };

// A void that is not a ledger reversal: the stock just moves back.
const TRANSFER_VOID = { label: 'Void', body: (noun) => `The stock moves back. The ${noun} stays on record as Void.` };

// List columns (keys rendered by StockDocumentsList), in Manager's order.
export const STOCK_DOCUMENTS = {
  [STOCK_TYPES.transfer]: {
    type: STOCK_TYPES.transfer,
    tab: INVENTORY_TABS.transfers,
    service: stockDocumentsService('inventory-transfers'),
    title: 'Inventory Transfer',
    plural: 'Inventory Transfers',
    noun: 'inventory transfer',
    posts: false,
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
    posts: true,
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
    posts: true,
    locations: 'one',
    production: true,
    statuses: PRODUCTION_STATUS,
    columns: [
      ['date', 'Date'], ['reference', 'Reference'], ['description', 'Description'], ['finishedItem', 'Finished item'],
      ['qty', 'Qty'], ['totalCost', 'Total cost'], ['status', 'Status'],
    ],
  },
};

const STOCK_TABS_BY_TYPE = Object.fromEntries(Object.values(STOCK_DOCUMENTS).map((config) => [config.type, config.tab]));

// Where a document of a stock movement opens: the stock documents' own tabs, else the shared ledger map.
export function stockDocumentHref(documentType, documentId) {
  const tab = STOCK_TABS_BY_TYPE[documentType];
  return tab ? `?tab=${tab}&view=${documentId}` : documentHref(documentType, documentId);
}

export function stockDocumentLabel(documentType) {
  return STOCK_DOCUMENTS[documentType]?.title ?? DOCUMENT_TYPE_LABELS[documentType] ?? documentType;
}

// "W1 · Widget" for an item, location or account record ({ code, name }).
export function recordLabel(record) {
  return record.code ? `${record.code} · ${record.name}` : record.name;
}

// An inventory item with what is on hand, so a picker shows what can be moved, used or sold.
export function inventoryItemLabel(item) {
  const name = recordLabel(item);
  return item.qty_on_hand === undefined ? name : `${name} (${plainNumber(item.qty_on_hand)} on hand)`;
}
