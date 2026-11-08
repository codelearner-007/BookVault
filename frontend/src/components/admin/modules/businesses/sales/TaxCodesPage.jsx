'use client';

import { useState } from 'react';
import { Percent } from 'lucide-react';
import { getCoaTree } from '@/lib/services/coa.service';
import { taxCodesService } from '@/lib/services/settings-catalog.service';
import { parseAmount } from '../ledger/JournalLinesEditor';
import { todayIso } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import CatalogSettingsPage, { accountsUnder } from './CatalogSettingsPage';
import { AccountField, CatalogDialog, InactiveSwitch, TextInput, useCatalogSave } from './catalog-dialog';
import { plainNumber } from './sales-documents';

const AREA = 'settings.tax_codes';
const TAX_ACCOUNT_ROOTS = ['liabilities', 'assets'];

const COLUMNS = [
  { key: 'name', label: 'Name', render: (code) => code.name },
  { key: 'code', label: 'Code', render: (code) => code.code },
  { key: 'rate', label: 'Rate', numeric: true, render: (code) => `${plainNumber(code.rate)}%` },
  { key: 'account', label: 'Account', render: (code) => code.account_name },
];

function buildBody(form, isEdit) {
  if (!form.name.trim()) return { error: 'Name is required.' };
  const rate = parseAmount(form.rate);
  if (!form.rate.trim() || rate === null) return { error: 'Enter the rate as a percent, for example 10.' };
  return {
    body: {
      name: form.name.trim(),
      code: form.code.trim() || null,
      rate,
      account_id: form.accountId || null,
      ...(isEdit ? { is_inactive: form.isInactive } : {}),
    },
  };
}

function TaxCodeDialog({ businessId, record, onClose, onSaved }) {
  const tree = useLoad(() => getCoaTree(businessId, todayIso()), [businessId]);
  const [form, setForm] = useState(() => ({
    name: record?.name ?? '',
    code: record?.code ?? '',
    rate: plainNumber(record?.rate),
    accountId: record?.account_id ?? '',
    isInactive: record?.is_inactive ?? false,
  }));
  const { saving, error, save } = useCatalogSave({ service: taxCodesService, businessId, record, onSaved });
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const accounts = tree.data ? accountsUnder(tree.data, TAX_ACCOUNT_ROOTS) : [];

  return (
    <CatalogDialog title={record ? 'Edit Tax Code' : 'New Tax Code'} saving={saving} error={error ?? tree.error} onClose={onClose} onSave={() => save(buildBody(form, !!record))}>
      <TextInput id="tax-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={saving} autoFocus />
      <TextInput id="tax-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={saving} />
      <TextInput id="tax-rate" label="Rate (%)" inputMode="decimal" className="num w-32" value={form.rate} onChange={(v) => setField('rate', v)} disabled={saving} />
      <AccountField
        id="tax-account" label="Account" value={form.accountId} accounts={accounts} noneLabel="Tax payable (default)"
        onChange={(id) => setField('accountId', id)} disabled={saving || !tree.data}
      />
      {record && <InactiveSwitch id="tax-inactive" checked={form.isInactive} onChange={(on) => setField('isInactive', on)} disabled={saving} />}
    </CatalogDialog>
  );
}

// ?tab=settings&page=tax-codes: one rate per code in B4; the account defaults to Tax payable.
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
