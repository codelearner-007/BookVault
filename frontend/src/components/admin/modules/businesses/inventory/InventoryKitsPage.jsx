'use client';

import { useState } from 'react';
import { Combine } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getCoaTree } from '@/lib/services/coa.service';
import { inventoryItemsService, inventoryKitsService } from '@/lib/services/inventory.service';
import { taxCodesService } from '@/lib/services/settings-catalog.service';
import { COLUMN_KIND } from '@/components/common/list-table';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { optionalNumber } from '../banking/CashLinesEditor';
import CatalogSettingsPage, { accountsUnder } from '../sales/CatalogSettingsPage';
import { AccountField, CatalogDialog, InactiveSwitch, RecordSelect, TextInput, useCatalogSave } from '../sales/catalog-dialog';
import { plainNumber } from '../sales/sales-documents';
import { INVENTORY_AREAS } from './inventory-documents';
import StockLinesEditor from './StockLinesEditor';
import { emptyStockLine } from './stock-form-model';

const INCOME_ROOTS = ['income'];
const NO_CATALOGS = { items: [], income: [], taxCodes: [] };

// Manager's columns: Item name, Sales price.
const COLUMNS = [
  { key: 'name', label: 'Item name', render: (kit) => kit.name },
  { key: 'price', label: 'Sales price', kind: COLUMN_KIND.money, value: (kit) => kit.sales_unit_price },
];

function formFrom(kit) {
  const components = (kit?.components ?? []).map((part) => ({ ...emptyStockLine(), item_id: part.item_id, qty: plainNumber(part.qty) }));
  return {
    name: kit?.name ?? '',
    code: kit?.code ?? '',
    description: kit?.description ?? '',
    salesPrice: toInputAmount(kit?.sales_unit_price),
    incomeAccountId: kit?.income_account_id ?? '',
    taxCodeId: kit?.tax_code_id ?? '',
    isInactive: kit?.is_inactive ?? false,
    components: components.length > 0 ? components : [emptyStockLine()],
  };
}

const isPositive = (text) => parseAmount(text) !== null && Number(parseAmount(text)) > 0;

function buildBody(form, isEdit) {
  const components = form.components.filter((part) => part.item_id || part.qty.trim());
  if (!form.name.trim()) return { error: 'Name is required.' };
  if (form.salesPrice.trim() !== '' && parseAmount(form.salesPrice) === null) return { error: 'The sales price must be a number, for example 120.00.' };
  if (components.length === 0) return { error: 'Add at least one inventory item to the kit.' };
  if (components.some((part) => !part.item_id || !isPositive(part.qty))) return { error: 'Every component needs an item and a qty more than zero.' };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      sales_unit_price: optionalNumber(form.salesPrice),
      income_account_id: form.incomeAccountId || null,
      tax_code_id: form.taxCodeId || null,
      components: components.map((part) => ({ item_id: part.item_id, qty: parseAmount(part.qty) })),
      ...(isEdit ? { is_inactive: form.isInactive } : {}),
    },
  };
}

function useKitCatalogs(businessId) {
  return useLoad(async () => {
    const [items, tree, taxCodes] = await Promise.all([
      inventoryItemsService.listAll(businessId), getCoaTree(businessId, todayIso()), taxCodesService.listAll(businessId),
    ]);
    return {
      items: items.items.filter((item) => !item.is_inactive),
      income: accountsUnder(tree, INCOME_ROOTS),
      taxCodes: taxCodes.items.filter((code) => !code.is_inactive),
    };
  }, [businessId]);
}

function KitDialog({ businessId, record, onClose, onSaved }) {
  const catalogs = useKitCatalogs(businessId);
  const [form, setForm] = useState(() => formFrom(record));
  const { saving, error, save } = useCatalogSave({ service: inventoryKitsService, businessId, record, onSaved });
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const options = catalogs.data ?? NO_CATALOGS;
  const busy = saving || !catalogs.data;
  // A saved component whose item is now inactive still shows in its picker.
  const savedParts = (record?.components ?? []).filter((part) => !options.items.some((item) => item.id === part.item_id));
  const items = [...options.items, ...savedParts.map((part) => ({ id: part.item_id, code: part.item_code, name: part.item_name }))];

  return (
    <CatalogDialog title={record ? 'Edit Inventory Kit' : 'New Inventory Kit'} saving={saving} error={error ?? catalogs.error} onClose={onClose} onSave={() => save(buildBody(form, !!record))}>
      <TextInput id="kit-name" label="Item name" value={form.name} onChange={(v) => setField('name', v)} disabled={saving} autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput id="kit-code" label="Item code" value={form.code} onChange={(v) => setField('code', v)} disabled={saving} />
        <TextInput id="kit-sales-price" label="Sales unit price" inputMode="decimal" className="num" value={form.salesPrice} onChange={(v) => setField('salesPrice', v)} disabled={saving} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="kit-description">Description</Label>
        <Textarea id="kit-description" rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={saving} />
      </div>
      <AccountField id="kit-income" label="Custom income account" value={form.incomeAccountId} accounts={options.income} noneLabel="Inventory - sales" onChange={(id) => setField('incomeAccountId', id)} disabled={busy} />
      <RecordSelect id="kit-tax" label="Tax code" value={form.taxCodeId} options={options.taxCodes} noneLabel="No tax" onChange={(id) => setField('taxCodeId', id)} disabled={busy} />
      <div className="grid gap-2">
        <p className="text-sm font-medium">Components</p>
        <StockLinesEditor
          label="Components" columns={['item', 'qty']} lines={form.components} catalogs={{ items, accounts: [] }}
          setLines={(update) => setForm((prev) => ({ ...prev, components: update(prev.components) }))}
          addLabel="Add component" lineNoun="component" disabled={busy}
        />
      </div>
      {record && <InactiveSwitch id="kit-inactive" checked={form.isInactive} onChange={(on) => setField('isInactive', on)} disabled={saving} />}
    </CatalogDialog>
  );
}

// ?tab=settings&page=inventory-kits: inventory items sold together on one line (the stock of each component moves).
export default function InventoryKitsPage({ business }) {
  return (
    <CatalogSettingsPage
      businessId={business.id}
      title="Inventory Kits"
      noun="Inventory Kit"
      area={INVENTORY_AREAS.kits}
      service={inventoryKitsService}
      columns={COLUMNS}
      inUseCode="item_in_use"
      inUseMessage="This kit is used on documents, so it cannot be deleted. Mark it inactive instead."
      icon={Combine}
      renderDialog={(props) => <KitDialog businessId={business.id} {...props} />}
    />
  );
}
