'use client';

import Link from 'next/link';
import { PARTY_KINDS } from '@/lib/services/parties.service';
import { latePaymentFeesService } from '@/lib/services/late-payment-fees.service';
import { FormattedDate } from '@/components/common/business-format';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, documentHref, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { DOC_TYPES, SALES_TABS } from './sales-documents';
import DocumentHeader, { DocumentDescription, AmountTotal, DocumentPaper, usePartyRecord } from '../documents/DocumentHeader';

// ?tab=late-payment-fees&view=<id>: the fee, Edit / Post / Void and attachments.
export default function LateFeeView({ business, feeId, rights }) {
  const navigate = useTabNavigate(SALES_TABS.lateFees);
  const { data, error, reload } = useLoad(
    () => latePaymentFeesService.get(business.id, feeId),
    [business.id, feeId],
  );
  const partyRecord = usePartyRecord(business.id, PARTY_KINDS.customer, data?.customer_id);

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
      onClone={() => navigate({ new: 1, clone: fee.id })}
      postCall={(version, key) => latePaymentFeesService.post(business.id, fee.id, version, key)}
      voidCall={(version, key) => latePaymentFeesService.void(business.id, fee.id, version, key)}
      onChanged={reload}
    >
      <DocumentPaper>
        <DocumentHeader
          title="Late Payment Fee"
          status={fee.status !== JE_STATUS.posted && <StatusBadge status={fee.status} />}
          business={business}
          party={{ label: 'Customer', name: fee.customer_name, record: partyRecord }}
          meta={[
            ['Reference', fee.reference],
            ['Date', <FormattedDate key="d" value={fee.date} />],
            ['Sales invoice', <Link key="i" href={documentHref(DOC_TYPES.invoice, fee.invoice_id)} className="hover:text-link hover:underline">{fee.invoice_reference}</Link>],
          ]}
        />
        <DocumentDescription text={fee.description} />
        <AmountTotal label="Fee" value={fee.amount} />
      </DocumentPaper>
      <AttachmentsPanel businessId={business.id} documentId={fee.id} canEdit={rights.edit && !fee.is_locked} />
    </DocumentViewFrame>
  );
}
