'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy } from 'lucide-react';
import { ConfirmDialog } from '@/components/super-admin/platform-parts';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_CREATE } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import { tabArea } from '@/lib/navigation/business-tabs';
import { getDocumentJournal } from '@/lib/services/journal-entries.service';
import TransactionJournal from '../ledger/TransactionJournal';
import { ErrorAlert, JE_STATUS, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { CREDIT_LIMIT_WARNING, TRADE_DOCUMENTS, TRADE_ERRORS } from './sales-documents';
import { creditLimitConfirm } from './sales-parts';
import TradeDocumentPaper from './TradeDocumentPaper';

// "Copy to" entries the user may use: each opens the target's new form prefilled from this document.
function useCopyItems(config, doc) {
  const router = useRouter();
  const { access } = useBusinessWorkspace();
  if (!doc || doc.status === JE_STATUS.void) return [];
  return config.copyTargets
    .map((type) => TRADE_DOCUMENTS[type])
    .filter((target) => can(access, tabArea(target.tab), RIGHT_CREATE))
    .map((target) => ({
      label: `Copy to ${target.title}`,
      icon: Copy,
      onSelect: () => router.push(`?tab=${target.tab}&new=1&from=${doc.id}&from_type=${config.type}`),
    }));
}

function Warnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <ul className="mb-4 space-y-1 text-sm text-warn">
      {warnings.map((warning) => (
        <li key={warning.code} className="flex items-center gap-2">
          <AlertTriangle className="size-4" aria-hidden="true" />
          {warning.message}
        </li>
      ))}
    </ul>
  );
}

/*
  ?tab=<type tab>&view=<id>: the document, Edit / Post / Void (Cancel for quotes and orders), Copy to,
  the Transaction Journal of posting types and attachments. Posting an invoice over the customer's credit
  limit asks first (409 credit_limit_warning), then posts with credit_limit_override.
*/
export default function TradeDocumentView({ business, config, docId, rights }) {
  const navigate = useTabNavigate(config.tab);
  const { service } = config;
  const { data, error, reload } = useLoad(
    () => Promise.all([service.get(business.id, docId), config.posts ? getDocumentJournal(business.id, docId) : null]),
    [business.id, config.type, docId],
  );
  const [creditPrompt, setCreditPrompt] = useState(null);
  const [overriding, setOverriding] = useState(false);
  const [postError, setPostError] = useState(null);
  const doc = data?.[0];
  const copyItems = useCopyItems(config, doc);

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const journal = data[1];

  async function postCall(version, key) {
    try {
      await service.post(business.id, doc.id, { version }, key);
    } catch (err) {
      if (err?.code !== CREDIT_LIMIT_WARNING) throw Object.assign(err, { message: TRADE_ERRORS[err?.code] ?? err.message });
      setCreditPrompt({ version, details: err.details ?? {} });
    }
  }

  async function postOverLimit() {
    setOverriding(true);
    setPostError(null);
    try {
      await service.post(business.id, doc.id, { version: creditPrompt.version, credit_limit_override: true }, crypto.randomUUID());
      reload();
    } catch (err) {
      setPostError(err?.message ?? 'Failed to post.');
    } finally {
      setOverriding(false);
      setCreditPrompt(null);
    }
  }

  return (
    <DocumentViewFrame
      title={doc.reference ? `${config.title} ${doc.reference}` : config.title}
      doc={doc}
      rights={rights}
      noun={config.noun}
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      postCall={postCall}
      voidCall={(version, key) => service.void(business.id, doc.id, version, key)}
      onChanged={reload}
      menuItems={copyItems}
      voidCopy={config.voidCopy}
    >
      <ConfirmDialog
        confirm={creditLimitConfirm(creditPrompt?.details ?? null)}
        busy={overriding}
        onConfirm={postOverLimit}
        onClose={() => setCreditPrompt(null)}
        cancelLabel="Cancel"
      />
      {postError && <ErrorAlert>{postError}</ErrorAlert>}
      <Warnings warnings={doc.warnings} />
      <TradeDocumentPaper doc={doc} config={config} businessName={business.name} />
      {config.posts && <TransactionJournal journal={journal} />}
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
