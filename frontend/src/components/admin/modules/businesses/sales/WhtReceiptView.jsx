'use client';

import { PARTY_KINDS } from '@/lib/services/parties.service';
import { withholdingTaxReceiptsService } from '@/lib/services/withholding-tax.service';
import { FormattedDate } from '@/components/common/business-format';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { SALES_TABS } from './sales-documents';
import DocumentHeader, { DocumentDescription, AmountTotal, DocumentPaper, usePartyRecord } from '../documents/DocumentHeader';

const TITLE = 'Withholding Tax Receipt';

// ?tab=withholding-tax-receipts&view=<id>: the receipt, Edit / Post / Void, its Transaction Journal and attachments.
export default function WhtReceiptView({ business, receiptId, rights }) {
  const navigate = useTabNavigate(SALES_TABS.whtReceipts);
  const { data, error, reload } = useLoad(
    () => withholdingTaxReceiptsService.get(business.id, receiptId),
    [business.id, receiptId],
  );
  const partyRecord = usePartyRecord(business.id, PARTY_KINDS.customer, data?.customer_id);

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
      onClone={() => navigate({ new: 1, clone: receipt.id })}
      postCall={(version, key) => withholdingTaxReceiptsService.post(business.id, receipt.id, version, key)}
      voidCall={(version, key) => withholdingTaxReceiptsService.void(business.id, receipt.id, version, key)}
      onChanged={reload}
    >
      <DocumentPaper>
        <DocumentHeader
          title={TITLE}
          status={receipt.status !== JE_STATUS.posted && <StatusBadge status={receipt.status} />}
          business={business}
          party={{ label: 'Customer', name: receipt.customer_name, record: partyRecord }}
          meta={[['Reference', receipt.reference], ['Date', <FormattedDate key="d" value={receipt.date} />]]}
        />
        <DocumentDescription text={receipt.description} />
        <AmountTotal label="Amount withheld" value={receipt.amount} />
      </DocumentPaper>
      <AttachmentsPanel businessId={business.id} documentId={receipt.id} canEdit={rights.edit && !receipt.is_locked} />
    </DocumentViewFrame>
  );
}
