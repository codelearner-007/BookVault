'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { can } from '@/lib/navigation/access';
import { isVersionConflict } from '@/lib/services/api-client';
import { getCoaTree } from '@/lib/services/coa.service';
import { inventoryItemsService, inventoryKitsService, inventoryLocationsService } from '@/lib/services/inventory.service';
import { nonInventoryItemsService, taxCodesService } from '@/lib/services/settings-catalog.service';
import { listStartingBalanceInvoices } from '@/lib/services/starting-balances.service';
import { BackButton, ErrorAlert, JE_STATUS, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { FormSkeleton, useLoad } from '../banking/banking-parts';
import { lineAccountsFromTree } from '../banking/cash-directions';
import { BlockedForm, DocumentFormActions, blockedReason, useDocumentSave } from '../banking/document-form';
import { INVENTORY_AREAS } from '../inventory/inventory-documents';
import {
  CREDIT_LIMIT_WARNING, DOC_TYPES, ITEM_KINDS, ROLES, TRADE_DOCUMENTS, TRADE_ERRORS, TRADE_SIDES, movesStock,
} from './sales-documents';
import { StartingBalanceFields, TradeHeaderFields, TradeOptions } from './TradeDocumentFields';
import { creditLimitConfirm } from './sales-parts';
import { useMoneyFormatter } from '@/components/common/money';
import TradeLinesEditor from './TradeLinesEditor';
import { TradeTotalsPanel, totalsOfDoc, useTradeTotals } from './TradeTotals';
import { DUE_MODES, buildTradeBody, totalsRequest, tradeForm } from './trade-form-model';

const STARTING_BALANCES_HREF = '?tab=settings&page=starting-balances';
const NO_RECORDS = { items: [] };

// Active catalog records plus any a saved document's lines still use (so its picker shows them).
function withSaved(records, savedLines, idKey, nameKey) {
  const active = records.filter((record) => !record.is_inactive);
  const known = new Set(active.map((record) => record.id));
  for (const line of savedLines) {
    if (!line[idKey] || known.has(line[idKey])) continue;
    known.add(line[idKey]);
    active.push({ id: line[idKey], name: line[nameKey], code: null });
  }
  return active;
}

const tagged = (kind) => (record) => ({ ...record, kind });

/*
  What a line can pick: non-inventory items, inventory items (with their qty on hand) and, on sales, kits (a kit
  can only be sold). Inventory lists the member may not view are left out; the server enforces every right.
*/
async function listLineItems(businessId, side, mayView) {
  const [plain, stocked, kits] = await Promise.all([
    nonInventoryItemsService.listAll(businessId),
    mayView(INVENTORY_AREAS.items) ? inventoryItemsService.listAll(businessId) : NO_RECORDS,
    side === TRADE_SIDES.sales && mayView(INVENTORY_AREAS.kits) ? inventoryKitsService.listAll(businessId) : NO_RECORDS,
  ]);
  return [...plain.items, ...stocked.items.map(tagged(ITEM_KINDS.inventory)), ...kits.items.map(tagged(ITEM_KINDS.kit))];
}

function useTradeFormData(businessId, config, docId, copyFrom, startingBalance) {
  const { access } = useBusinessWorkspace();
  const mayView = (area) => can(access, area);
  return useLoad(async () => {
    const [tree, items, taxCodes, locations, doc, copy, starting] = await Promise.all([
      config.accounts ? getCoaTree(businessId, todayIso()) : null,
      listLineItems(businessId, config.side, mayView),
      config.priced ? taxCodesService.listAll(businessId) : null,
      movesStock(config) && mayView(INVENTORY_AREAS.locations) ? inventoryLocationsService.listAll(businessId) : null,
      docId ? config.service.get(businessId, docId) : null,
      copyFrom ? TRADE_DOCUMENTS[copyFrom.type].service.copyTo(businessId, copyFrom.id, config.type) : null,
      startingBalance ? listStartingBalanceInvoices(businessId, config.side.invoicesResource) : null,
    ]);
    const prefill = copy?.prefill ?? null;
    const partyId = prefill?.[config.side.partyField];
    const party = partyId ? await config.side.parties.get(businessId, partyId) : null;
    const savedLines = doc?.lines ?? [];
    return {
      doc,
      prefill,
      party,
      starting,
      locations: locations?.items ?? null,
      catalogs: {
        items: withSaved(items, savedLines, 'item_id', 'item_name'),
        taxCodes: taxCodes ? withSaved(taxCodes.items, savedLines, 'tax_code_id', 'tax_code_name') : [],
        accounts: tree ? lineAccountsFromTree(tree, savedLines.filter((line) => line.account_id)) : [],
      },
    };
  }, [businessId, config.type, docId, copyFrom?.type, copyFrom?.id, startingBalance]);
}

// Form state once per loaded record: a saved document, a copy-to prefill, or a new form.
function initialForm(loaded, config, copyFrom, startingBalance) {
  const { doc, prefill, party, starting } = loaded;
  const { partyField, partyNameField } = config.side;
  if (doc) return tradeForm(doc, { id: doc[partyField], name: doc[partyNameField] });
  const form = tradeForm(prefill, party ? { id: party.id, name: party.name } : null, {
    sourceId: copyFrom?.id ?? null, startingBalance, openingDate: starting?.opening_date,
  });
  // Customers carry default due days; suppliers do not.
  if (config.role === ROLES.invoice && !prefill?.due_date && party?.default_due_days != null) {
    return { ...form, dueMode: DUE_MODES.net, dueDays: String(party.default_due_days) };
  }
  return form;
}

/*
  ?tab=<type tab>&new=1 | &edit=<id>  [&from=<source id>&from_type=<type> after Copy to]  [&starting_balance=1]
  Save draft / Post (one primary); a posted document has one Update. One Idempotency-Key per submit.
*/
export default function TradeDocumentForm({ businessId, config, docId, allowed, copyFrom = null, startingBalance = false }) {
  const router = useRouter();
  const navigate = useTabNavigate(config.tab);
  const data = useTradeFormData(businessId, config, docId, copyFrom, startingBalance);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [creditPrompt, setCreditPrompt] = useState(null);
  const money = useMoneyFormatter();
  const override = useRef(false);
  const hasCreditLimit = config.type === DOC_TYPES.invoice;
  const { save, setVersion } = useDocumentSave({
    docId,
    create: (body, key) => config.service.create(businessId, body, key),
    update: (body) => config.service.update(businessId, docId, body),
    post: (version, key) => config.service.post(businessId, docId, { version, ...(hasCreditLimit ? { credit_limit_override: override.current } : {}) }, key),
  });

  const [filledFrom, setFilledFrom] = useState(undefined);
  if (data.data && filledFrom !== data.data) {
    setFilledFrom(data.data);
    setForm(initialForm(data.data, config, copyFrom, startingBalance));
    setVersion(data.data.doc?.version ?? null);
  }

  const partyId = form?.party?.id ?? null;
  const date = form?.date ?? null;
  const isNote = config.role === ROLES.note;
  const invoices = useLoad(
    () => (isNote && partyId && date ? config.side.parties.openInvoices(businessId, partyId, date) : Promise.resolve(NO_RECORDS)),
    [businessId, config.type, partyId, date],
  );
  const doc = data.data?.doc;
  const totals = useTradeTotals(config.service, businessId, form ? totalsRequest(form, config) : null, totalsOfDoc(doc));

  const isStarting = startingBalance || !!doc?.is_starting_balance;
  const title = docId ? `Edit ${config.title}` : isStarting ? 'New starting-balance invoice' : `New ${config.title}`;
  const back = () => {
    if (docId) navigate({ view: docId });
    else if (startingBalance) router.push(STARTING_BALANCES_HREF);
    else navigate({});
  };
  const reason = blockedReason({ allowed, doc, noun: config.noun });
  if (!allowed || (doc && reason)) return <BlockedForm title={title} reason={reason} onBack={back} />;
  if (!form) return data.error ? <ErrorAlert>{data.error}</ErrorAlert> : <FormSkeleton fields={6} lines={2} />;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function pickParty(party) {
    setForm((prev) => ({ ...prev, party, invoiceId: '' }));
    const record = await config.side.parties.get(businessId, party.id).catch(() => null);
    if (!record) return;
    setForm((prev) => ({
      ...prev,
      billingAddress: record.billing_address ?? '',
      deliveryAddress: record.delivery_address ?? '',
      ...(config.role === ROLES.invoice && record.default_due_days != null ? { dueMode: DUE_MODES.net, dueDays: String(record.default_due_days) } : {}),
    }));
  }

  async function submit(action, creditLimitOverride = false) {
    const { body, error: invalid } = buildTradeBody(form, config, { creditLimitOverride, isEdit: !!docId });
    if (invalid) { setError({ message: invalid }); return; }
    override.current = creditLimitOverride;
    setSaving(true);
    setError(null);
    try {
      const saved = await save(action, docId || !form.sourceId ? body : { ...body, source_document_id: form.sourceId });
      navigate({ view: saved.id });
    } catch (err) {
      if (err?.code === CREDIT_LIMIT_WARNING) setCreditPrompt({ action, details: err.details ?? {} });
      else setError({ message: TRADE_ERRORS[err?.code] ?? err?.message ?? 'Failed to save.', conflict: isVersionConflict(err) });
    } finally {
      setSaving(false);
    }
  }

  const reloadAction = error?.conflict && (
    <Button variant="secondary" size="sm" onClick={() => { setError(null); data.reload(); }}>Reload</Button>
  );

  return (
    <div className="max-w-6xl">
      <ConfirmDialog
        confirm={creditLimitConfirm(creditPrompt?.details ?? null, money)}
        busy={saving}
        onConfirm={() => { const { action } = creditPrompt; setCreditPrompt(null); submit(action, true); }}
        onClose={() => setCreditPrompt(null)}
        cancelLabel="Cancel"
      />
      <PageHeader title={title} back={<BackButton onClick={back} disabled={saving} />} />
      {error && <ErrorAlert action={reloadAction}>{error.message}</ErrorAlert>}
      <div className="space-y-8">
        <TradeHeaderFields
          businessId={businessId}
          config={config}
          form={form}
          setField={setField}
          onParty={pickParty}
          openInvoices={invoices.data?.items ?? []}
          currentInvoice={doc?.invoice_id ? { id: doc.invoice_id, reference: doc.invoice_reference } : null}
          locations={data.data.locations}
          disabled={saving}
        />
        {isStarting && (
          <StartingBalanceFields config={config} form={form} setField={setField} booksStartDate={data.data.starting?.books_start_date} disabled={saving} />
        )}
        <TradeLinesEditor
          config={config}
          lines={form.lines}
          setLines={(update) => setForm((prev) => ({ ...prev, lines: update(prev.lines) }))}
          discountType={form.discountType}
          catalogs={data.data.catalogs}
          lineTotals={totals.invalid ? null : totals.totals?.lines}
          disabled={saving}
        />
        {config.priced && <TradeTotalsPanel totals={totals.totals} invalid={totals.invalid} />}
        <TradeOptions config={config} form={form} setField={setField} isEdit={!!docId} locations={data.data.locations} disabled={saving} />
        <DocumentFormActions isPosted={doc?.status === JE_STATUS.posted} saving={saving} onSubmit={(action) => submit(action)} onCancel={back} />
      </div>
    </div>
  );
}
