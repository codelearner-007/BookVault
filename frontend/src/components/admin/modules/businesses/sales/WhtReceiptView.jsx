'use client';

import { Card } from '@/components/ui/card';
import { withholdingTaxReceiptsService } from '@/lib/services/withholding-tax.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import TransactionJournal from '../ledger/TransactionJournal';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { SALES_TABS } from './sales-documents';
import { Field } from './sales-parts';

const TITLE = 'Withholding Tax Receipt';

// ?tab=withholding-tax-receipts&view=<id>: the receipt, Edit / Post / Void, its Transaction Journal and attachments.
export default function WhtReceiptView({ business, receiptId, rights }) {
  const navigate = useTabNavigate(SALES_TABS.whtReceipts);
  const { data, error, reload } = useLoad(
    () => withholdingTaxReceiptsService.get(business.id, receiptId),
    [business.id, receiptId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const receipt = data;

  return (
    <DocumentViewFrame
      title={receipt.reference ? `${TITLE} ${receipt.reference}` : TITLE}
      doc={receipt}
      rights={rights}
      noun="withholding tax receipt"
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: receipt.id })}
      postCall={(version, key) => withholdingTaxReceiptsService.post(business.id, receipt.id, version, key)}
      voidCall={(version, key) => withholdingTaxReceiptsService.void(business.id, receipt.id, version, key)}
      onChanged={reload}
    >
      <Card className="p-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{TITLE}</h2>
            {receipt.status !== JE_STATUS.posted && <StatusBadge status={receipt.status} />}
          </div>
          <p className="font-semibold">{business.name}</p>
        </div>
        <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date"><FormattedDate value={receipt.date} className="tabular-nums" /></Field>
          <Field label="Customer">{receipt.customer_name}</Field>
          <Field label="Amount"><Money value={receipt.amount} className="font-semibold" /></Field>
        </dl>
        {receipt.description && <p className="mt-6 whitespace-pre-wrap">{receipt.description}</p>}
      </Card>
      <TransactionJournal businessId={business.id} documentId={receipt.id} version={receipt.version} />
      <AttachmentsPanel businessId={business.id} documentId={receipt.id} canEdit={rights.edit && !receipt.is_locked} />
    </DocumentViewFrame>
  );
}
