'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import TransactionJournal from '../ledger/TransactionJournal';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, documentHref, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { DOC_TYPES, SALES_TABS } from './sales-documents';
import { Field } from './sales-parts';

// ?tab=late-payment-fees&view=<id>: the fee, Edit / Post / Void, its Transaction Journal and attachments.
export default function LateFeeView({ business, feeId, rights }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const { data, error, reload } = useLoad(
    () => latePaymentFeesService.get(business.id, feeId),
    [business.id, feeId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const fee = data;

  return (
    <DocumentViewFrame
      title={fee.reference ? `Late Payment Fee ${fee.reference}` : 'Late Payment Fee'}
      doc={fee}
      rights={rights}
      noun="late payment fee"
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: fee.id })}
      postCall={(version, key) => latePaymentFeesService.post(business.id, fee.id, version, key)}
      voidCall={(version, key) => latePaymentFeesService.void(business.id, fee.id, version, key)}
      onChanged={reload}
    >
      <Card className="p-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">Late Payment Fee</h2>
            {fee.status !== JE_STATUS.posted && <StatusBadge status={fee.status} />}
          </div>
          <p className="font-semibold">{business.name}</p>
        </div>
        <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date"><FormattedDate value={fee.date} className="tabular-nums" /></Field>
          <Field label="Customer">{fee.customer_name}</Field>
          <Field label="Sales invoice">
            <Link href={documentHref(DOC_TYPES.invoice, fee.invoice_id)} className="hover:text-link hover:underline">{fee.invoice_reference}</Link>
          </Field>
          <Field label="Amount"><Money value={fee.amount} className="font-semibold" /></Field>
        </dl>
        {fee.description && <p className="mt-6 whitespace-pre-wrap">{fee.description}</p>}
      </Card>
      <TransactionJournal businessId={business.id} documentId={fee.id} version={fee.version} />
      <AttachmentsPanel businessId={business.id} documentId={fee.id} canEdit={rights.edit && !fee.is_locked} />
    </DocumentViewFrame>
  );
}
