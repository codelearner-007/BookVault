'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/common/date-picker';
import { PageHeader } from '@/components/common/page';
import { isVersionConflict } from '@/lib/services/api-client';
import { getCoaTree } from '@/lib/services/coa.service';
import { inventoryItemsService, inventoryLocationsService } from '@/lib/services/inventory.service';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useLoad } from '../banking/banking-parts';
import { lineAccountsFromTree } from '../banking/cash-directions';
import { BlockedForm, DocumentFormActions, asClone, blockedReason, useDocumentSave } from '../banking/document-form';
import { RecordSelect, TextInput } from '../sales/catalog-dialog';
import { DEFAULT_LOCATION_LABEL } from './inventory-documents';
import StockLinesEditor from './StockLinesEditor';
import { buildStockBody, stockForm } from './stock-form-model';

// Active inventory items plus any the saved document still uses (its lines and finished item).
function itemsWithSaved(items, doc) {
  const active = items.filter((item) => !item.is_inactive);
  const saved = [
    ...(doc?.lines ?? []).map((line) => ({ id: line.item_id, code: line.item_code, name: line.item_name })),
    ...(doc?.finished_item_id ? [{ id: doc.finished_item_id, code: null, name: doc.finished_item_name }] : []),
  ];
  const known = new Set(active.map((item) => item.id));
  for (const item of saved) {
    if (!item.id || known.has(item.id)) continue;
    known.add(item.id);
    active.push(item);
  }
  return active;
}

function useStockFormData(businessId, config, docId, cloneId) {
  return useLoad(async () => {
    const [items, locations, tree, doc] = await Promise.all([
      inventoryItemsService.listAll(businessId),
      inventoryLocationsService.listAll(businessId),
      config.lineAccount || config.production ? getCoaTree(businessId, todayIso()) : null,
      docId || cloneId ? config.service.get(businessId, docId ?? cloneId) : null,
    ]);
    const savedAccounts = [...(doc?.lines ?? []), ...(doc?.costs ?? [])].filter((line) => line.account_id);
    return {
      doc: docId ? doc : null,
      clone: docId ? null : doc,
      items: itemsWithSaved(items.items, doc),
      locations: locations.items,
      accounts: tree ? lineAccountsFromTree(tree, savedAccounts) : [],
    };
  }, [businessId, config.type, docId, cloneId]);
}

function LocationFields({ config, form, setField, locations, disabled }) {
  if (config.locations === 'pair') {
    return (
      <>
        <RecordSelect id="stock-from" label="From location" value={form.locationId} options={locations} placeholder="Select location" onChange={(id) => setField('locationId', id)} disabled={disabled} />
        <RecordSelect id="stock-to" label="To location" value={form.toLocationId} options={locations} placeholder="Select location" onChange={(id) => setField('toLocationId', id)} disabled={disabled} />
      </>
    );
  }
  return (
    <RecordSelect
      id="stock-location" label="Inventory location" value={form.locationId} options={locations} noneLabel={DEFAULT_LOCATION_LABEL}
      onChange={(id) => setField('locationId', id)} disabled={disabled}
    />
  );
}

// Manager's order: Date, Reference, location(s), Description; a production order then names what it makes.
function HeaderFields({ config, form, setField, loaded, disabled }) {
  const bind = (field) => ({ value: form[field], onChange: (value) => setField(field, value), disabled });
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="stock-date">Date</Label>
        <DatePicker id="stock-date" value={form.date} onChange={(value) => setField('date', value)} disabled={disabled} required />
      </div>
      <TextInput id="stock-reference" label="Reference" placeholder="Automatic" {...bind('reference')} />
      <LocationFields config={config} form={form} setField={setField} locations={loaded.locations} disabled={disabled} />
      <div className="sm:col-span-2">
        <TextInput id="stock-description" label="Description" {...bind('description')} />
      </div>
      {config.production && (
        <>
          <RecordSelect
            id="stock-finished-item" label="Finished item" value={form.finishedItemId} options={loaded.items} placeholder="Select item"
            onChange={(id) => setField('finishedItemId', id)} disabled={disabled}
          />
          <TextInput id="stock-qty" label="Qty" inputMode="decimal" className="num" {...bind('qty')} />
        </>
      )}
    </div>
  );
}

function LinesSection({ config, form, setForm, loaded, disabled }) {
  const catalogs = { items: loaded.items, accounts: loaded.accounts };
  const setList = (field) => (update) => setForm((prev) => ({ ...prev, [field]: update(prev[field]) }));
  if (!config.production) {
    const columns = config.lineAccount ? ['item', 'qty', 'account', 'description'] : ['item', 'description', 'qty'];
    return (
      <StockLinesEditor
        label="Lines" columns={columns} lines={form.lines} setLines={setList('lines')} catalogs={catalogs}
        accountPlaceholder={config.lineAccount ? 'Inventory write-offs' : undefined} disabled={disabled}
      />
    );
  }
  return (
    <>
      <section aria-labelledby="stock-bom" className="space-y-3">
        <h2 id="stock-bom" className="text-md font-semibold">Bill of materials</h2>
        <StockLinesEditor label="Bill of materials" columns={['item', 'qty']} lines={form.lines} setLines={setList('lines')} catalogs={catalogs} disabled={disabled} />
      </section>
      <section aria-labelledby="stock-costs" className="space-y-3">
        <h2 id="stock-costs" className="text-md font-semibold">Non-inventory costs</h2>
        <StockLinesEditor
          label="Non-inventory costs" columns={['account', 'description', 'amount']} lines={form.costs} setLines={setList('costs')}
          catalogs={catalogs} addLabel="Add non-inventory cost into production" lineNoun="cost line" minLines={0} disabled={disabled}
        />
      </section>
    </>
  );
}

/*
  ?tab=inventory-transfers|inventory-write-offs|production-orders &new=1 | &edit=<id>
  Save draft / Post (one primary); a posted document has one Update. Stock and cost errors (409 insufficient_stock)
  show the API message.
*/
export default function StockDocumentForm({ businessId, config, docId = null, cloneId = null, allowed }) {
  const navigate = useTabNavigate(config.tab);
  const data = useStockFormData(businessId, config, docId, cloneId);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { save, setVersion } = useDocumentSave({
    docId,
    create: (body, key) => config.service.create(businessId, body, key),
    update: (body) => config.service.update(businessId, docId, body),
    post: (version, key) => config.service.post(businessId, docId, version, key),
  });

  const [filledFrom, setFilledFrom] = useState(undefined);
  if (data.data && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(data.data.clone ? asClone(stockForm(data.data.clone)) : stockForm(data.data.doc));
    setVersion(data.data.doc?.version ?? null);
  }

  const title = docId ? `Edit ${config.title}` : `New ${config.title}`;
  const back = () => navigate(docId ? { view: docId } : {});
  const doc = data.data?.doc;
  const reason = blockedReason({ allowed, doc, noun: config.noun });
  if (!allowed || (doc && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={config.production ? 6 : 4} lines={2} />;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(action) {
    const { body, error: invalid } = buildStockBody(form, config);
    if (invalid) { setError({ message: invalid }); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = await save(action, body);
      navigate({ view: saved.id });
    } catch (err) {
      setError({ message: err?.message ?? `Failed to save the ${config.noun}.`, conflict: isVersionConflict(err) });
    } finally {
      setSaving(false);
    }
  }

  const reloadAction = error?.conflict && (
    <Button variant="secondary" size="sm" onClick={() => { setError(null); data.reload(); }}>Reload</Button>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title={title} back={<BackButton onClick={back} disabled={saving} />} />
      {error && <ErrorAlert action={reloadAction}>{error.message}</ErrorAlert>}
      <div className="space-y-8">
        <HeaderFields config={config} form={form} setField={setField} loaded={data.data} disabled={saving} />
        <LinesSection config={config} form={form} setForm={setForm} loaded={data.data} disabled={saving} />
        <DocumentFormActions isPosted={doc?.status === JE_STATUS.posted} saving={saving} onSubmit={submit} onCancel={back} />
      </div>
    </div>
  );
}
