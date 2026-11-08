'use client';

import { useState } from 'react';
import { Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCoaTree } from '@/lib/services/coa.service';
import { taxCodesService } from '@/lib/services/settings-catalog.service';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import CatalogSettingsPage, { accountsUnder } from './CatalogSettingsPage';
import { AccountField, CatalogDialog, InactiveSwitch, TextInput, useCatalogSave } from './catalog-dialog';
import { plainNumber } from './sales-documents';
import TaxComponentsEditor, { TAX_PAYABLE_DEFAULT, emptyTaxComponent } from './TaxComponentsEditor';

const AREA = 'settings.tax_codes';
const TAX_ACCOUNT_ROOTS = ['liabilities', 'assets'];
const TAX_TYPES = { single: 'single_rate', multiple: 'multiple_rates' };
const RATE_ERROR = 'Enter the rate as a percent, for example 10.';

function typeLabel(code) {
  if (code.type !== TAX_TYPES.multiple) return 'Single rate';
  return `Multiple rates (${code.components?.length ?? 0})`;
}

const COLUMNS = [
  { key: 'name', label: 'Name', render: (code) => code.name },
  { key: 'code', label: 'Code', render: (code) => code.code },
  { key: 'rate', label: 'Rate', numeric: true, render: (code) => `${plainNumber(code.rate)}%` },
  {
    key: 'type',
    label: 'Type',
    render: (code) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        {typeLabel(code)}
        {code.is_reverse_charge && <Badge variant="outline">Reverse charge</Badge>}
      </span>
    ),
  },
];

function formFrom(record) {
  const components = record?.type === TAX_TYPES.multiple
    ? record.components.map((c) => ({ key: c.id, name: c.name ?? '', rate: plainNumber(c.rate), accountId: c.account_id ?? '' }))
    : [emptyTaxComponent(), emptyTaxComponent()];
  return {
    name: record?.name ?? '',
    code: record?.code ?? '',
    type: record?.type ?? TAX_TYPES.single,
    rate: record?.type === TAX_TYPES.multiple ? '' : plainNumber(record?.rate),
    accountId: record?.type === TAX_TYPES.multiple ? '' : record?.account_id ?? '',
    components,
    isReverseCharge: record?.is_reverse_charge ?? false,
    isInactive: record?.is_inactive ?? false,
  };
}

function rateFields(form) {
  if (form.type === TAX_TYPES.single) {
    const rate = parseAmount(form.rate);
    if (!form.rate.trim() || rate === null) return { error: RATE_ERROR };
    return { fields: { rate, account_id: form.accountId || null } };
  }
  const components = [];
  for (const row of form.components) {
    const rate = parseAmount(row.rate);
    if (!row.rate.trim() || rate === null) return { error: `Every component needs a rate. ${RATE_ERROR}` };
    components.push({ name: row.name.trim() || null, rate, account_id: row.accountId || null });
  }
  return { fields: { components } };
}

function buildBody(form, isEdit) {
  if (!form.name.trim()) return { error: 'Name is required.' };
  const { fields, error } = rateFields(form);
  if (error) return { error };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      ...fields,
      is_reverse_charge: form.isReverseCharge,
      ...(isEdit ? { is_inactive: form.isInactive } : {}),
    },
  };
}

function TaxCodeDialog({ businessId, record, onClose, onSaved }) {
  const tree = useLoad(() => getCoaTree(businessId, todayIso()), [businessId]);
  const [form, setForm] = useState(() => formFrom(record));
  const { saving, error, save } = useCatalogSave({ service: taxCodesService, businessId, record, onSaved });
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const accounts = tree.data ? accountsUnder(tree.data, TAX_ACCOUNT_ROOTS) : [];
  const disabled = saving || !tree.data;

  return (
    <CatalogDialog title={record ? 'Edit Tax Code' : 'New Tax Code'} saving={saving} error={error ?? tree.error} onClose={onClose} onSave={() => save(buildBody(form, !!record))}>
      <TextInput id="tax-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={saving} autoFocus />
      <TextInput id="tax-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={saving} />
      <div className="grid gap-2">
        <Label htmlFor="tax-type">Type</Label>
        <Select value={form.type} onValueChange={(type) => setField('type', type)} disabled={saving}>
          <SelectTrigger id="tax-type" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TAX_TYPES.single}>Single rate</SelectItem>
            <SelectItem value={TAX_TYPES.multiple}>Multiple rates</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.type === TAX_TYPES.single ? (
        <>
          <TextInput id="tax-rate" label="Rate (%)" inputMode="decimal" className="num w-32" value={form.rate} onChange={(v) => setField('rate', v)} disabled={saving} />
          <AccountField
            id="tax-account" label="Account" value={form.accountId} accounts={accounts} noneLabel={TAX_PAYABLE_DEFAULT}
            onChange={(id) => setField('accountId', id)} disabled={disabled}
          />
        </>
      ) : (
        <TaxComponentsEditor
          components={form.components}
          setComponents={(update) => setForm((prev) => ({ ...prev, components: update(prev.components) }))}
          accounts={accounts}
          disabled={disabled}
        />
      )}
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Checkbox id="tax-reverse-charge" checked={form.isReverseCharge} onCheckedChange={(on) => setField('isReverseCharge', on === true)} disabled={saving} />
          <Label htmlFor="tax-reverse-charge" className="font-normal">Reverse charge</Label>
        </div>
        <p className="ps-6 text-sm text-muted-foreground">
          On purchases the tax is self-assessed: posted to and from the tax account, not owed to the supplier.
        </p>
      </div>
      {record && <InactiveSwitch id="tax-inactive" checked={form.isInactive} onChange={(on) => setField('isInactive', on)} disabled={saving} />}
    </CatalogDialog>
  );
}

// ?tab=settings&page=tax-codes: single-rate or multiple-rate codes (each component posts to its own account,
// Tax payable by default), optionally reverse charge.
export default function TaxCodesPage({ business }) {
  return (
    <CatalogSettingsPage
      businessId={business.id}
      title="Tax Codes"
      noun="Tax Code"
      area={AREA}
      service={taxCodesService}
      columns={COLUMNS}
      inUseCode="tax_code_in_use"
      inUseMessage="This tax code is used on documents, so it cannot be deleted. Mark it inactive instead."
      icon={Percent}
      renderDialog={(props) => <TaxCodeDialog businessId={business.id} {...props} />}
    />
  );
}
