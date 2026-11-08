'use client';

import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import ReceiptAllocations from '../sales/ReceiptAllocations';
import AttachmentsPanel from './AttachmentsPanel';
import { DocumentSkeleton, useLoad } from './banking-parts';
import CashDocumentPaper from './CashDocumentPaper';
import DocumentViewFrame from './DocumentViewFrame';
import { usePartyRecord } from '../documents/DocumentHeader';

// ?tab=receipts|payments&view=<id>: the document, Edit / Post / Void and attachments.
export default function CashTransactionView({ business, direction, docId, rights }) {
  const navigate = useTabNavigate(direction.tab);
  const { service } = direction;
  const { data, error, reload } = useLoad(
    () => service.get(business.id, docId),
    [business.id, direction.tab, docId],
  );
  const partyRecord = usePartyRecord(business.id, data?.counterparty_kind, data?.counterparty_party_id);

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const doc = data;

  return (
    <DocumentViewFrame
      businessId={business.id}
      title={doc.reference ? `${direction.title} ${doc.reference}` : direction.title}
      doc={doc}
      rights={rights}
      noun={direction.noun}
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      onClone={() => navigate({ new: 1, clone: doc.id })}
      postCall={(version, key) => service.post(business.id, doc.id, version, key)}
      voidCall={(version, key) => service.void(business.id, doc.id, version, key)}
      onChanged={reload}
    >
      <CashDocumentPaper doc={doc} direction={direction} business={business} partyRecord={partyRecord} />
      <ReceiptAllocations doc={doc} side={direction.side} />
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
