'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getCoaTree } from '@/lib/services/coa.service';
import { nonInventoryItemsService, taxCodesService } from '@/lib/services/settings-catalog.service';
import { formatMoney } from '@/lib/utils/money';
import { toInputAmount } from '../coa/coa-tree';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { optionalNumber } from '../banking/CashLinesEditor';
import CatalogSettingsPage, { accountsUnder } from './CatalogSettingsPage';
import { CatalogDialog, InactiveSwitch, RecordSelect, TextInput, useCatalogSave } from './catalog-dialog';

const AREA = 'non_inventory_items';
const INCOME_ROOTS = ['income'];
const EXPENSE_ROOTS = ['expenses'];

const COLUMNS = [
  { key: 'name', label: 'Name', render: (item) => item.name },
  { key: 'code', label: 'Code', render: (item) => item.code },
  { key: 'unit', label: 'Unit name', render: (item) => item.unit_name },
  { key: 'price', label: 'Sales price', numeric: true, render: (item) => formatMoney(item.sales_unit_price) },
  { key: 'income', label: 'Income account', render: (item) => item.income_account_name },
  { key: 'tax', label: 'Tax code', render: (item) => item.tax_code_name },
];

function formFrom(record) {
  return {
    name: record?.name ?? '',
    code: record?.code ?? '',
    unitName: record?.unit_name ?? '',
    description: record?.description ?? '',
    salesPrice: toInputAmount(record?.sales_unit_price),
    purchasePrice: toInputAmount(record?.purchase_unit_price),
    incomeAccountId: record?.income_account_id ?? '',
    expenseAccountId: record?.expense_account_id ?? '',
    taxCodeId: record?.tax_code_id ?? '',
    isInactive: record?.is_inactive ?? false,
  };
}

function buildBody(form, isEdit) {
  if (!form.name.trim()) return { error: 'Name is required.' };
  if (!form.incomeAccountId) return { error: 'Choose the income account.' };
  const badPrice = [form.salesPrice, form.purchasePrice].some((text) => text.trim() !== '' && parseAmount(text) === null);
  if (badPrice) return { error: 'Prices must be numbers, for example 120.00.' };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      unit_name: form.unitName.trim() || null,
      description: form.description.trim() || null,
      sales_unit_price: optionalNumber(form.salesPrice),
      purchase_unit_price: optionalNumber(form.purchasePrice),
      income_account_id: form.incomeAccountId,
      expense_account_id: form.expenseAccountId || null,
      tax_code_id: form.taxCodeId || null,
      ...(isEdit ? { is_inactive: form.isInactive } : {}),
    },
  };
}

function useItemCatalogs(businessId) {
  return useLoad(async () => {
    const [tree, taxCodes] = await Promise.all([getCoaTree(businessId, todayIso()), taxCodesService.listAll(businessId)]);
    return {
      income: accountsUnder(tree, INCOME_ROOTS),
      expense: accountsUnder(tree, EXPENSE_ROOTS),
      taxCodes: taxCodes.items.filter((code) => !code.is_inactive),
    };
  }, [businessId]);
}

function ItemDialog({ businessId, record, onClose, onSaved }) {
  const catalogs = useItemCatalogs(businessId);
  const [form, setForm] = useState(() => formFrom(record));
  const { saving, error, save } = useCatalogSave({ service: nonInventoryItemsService, businessId, record, onSaved });
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const options = catalogs.data ?? { income: [], expense: [], taxCodes: [] };
  const loading = !catalogs.data;

  return (
    <CatalogDialog title={record ? 'Edit Non-inventory Item' : 'New Non-inventory Item'} saving={saving} error={error ?? catalogs.error} onClose={onClose} onSave={() => save(buildBody(form, !!record))}>
      <TextInput id="item-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={saving} autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput id="item-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={saving} />
        <TextInput id="item-unit" label="Unit name" placeholder="e.g. pcs" value={form.unitName} onChange={(v) => setField('unitName', v)} disabled={saving} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="item-description">Description</Label>
        <Textarea id="item-description" rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} disabled={saving} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput id="item-sales-price" label="Sales unit price" inputMode="decimal" className="num" value={form.salesPrice} onChange={(v) => setField('salesPrice', v)} disabled={saving} />
        <TextInput id="item-purchase-price" label="Purchase unit price" inputMode="decimal" className="num" value={form.purchasePrice} onChange={(v) => setField('purchasePrice', v)} disabled={saving} />
      </div>
      <RecordSelect id="item-income" label="Income account" value={form.incomeAccountId} options={options.income} onChange={(id) => setField('incomeAccountId', id)} disabled={saving || loading} />
      <RecordSelect id="item-expense" label="Expense account" value={form.expenseAccountId} options={options.expense} noneLabel="None" onChange={(id) => setField('expenseAccountId', id)} disabled={saving || loading} />
      <RecordSelect id="item-tax" label="Tax code" value={form.taxCodeId} options={options.taxCodes} noneLabel="No tax" onChange={(id) => setField('taxCodeId', id)} disabled={saving || loading} />
      {record && <InactiveSwitch id="item-inactive" checked={form.isInactive} onChange={(on) => setField('isInactive', on)} disabled={saving} />}
    </CatalogDialog>
  );
}

// ?tab=settings&page=non-inventory-items: items that fill sales lines (description, price, income account, tax code).
export default function NonInventoryItemsPage({ business }) {
  return (
    <CatalogSettingsPage
      businessId={business.id}
      title="Non-inventory Items"
      noun="Item"
      area={AREA}
      service={nonInventoryItemsService}
      columns={COLUMNS}
      inUseCode="item_in_use"
      inUseMessage="This item is used on documents, so it cannot be deleted. Mark it inactive instead."
      icon={Package}
      renderDialog={(props) => <ItemDialog businessId={business.id} {...props} />}
    />
  );
}
