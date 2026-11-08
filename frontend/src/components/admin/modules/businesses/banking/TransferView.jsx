'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getTransfer, postTransfer, voidTransfer } from '@/lib/services/inter-account-transfers.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from './AttachmentsPanel';
import { BANKING_TABS, DocumentSkeleton, PendingBadge, useLoad } from './banking-parts';
import DocumentViewFrame from './DocumentViewFrame';
import DocumentHeader, { DocumentDescription, DocumentPaper } from '../documents/DocumentHeader';

const TITLE = 'Inter Account Transfer';

// A side is pending while it clears later and has no clear date yet.
function isPending(doc, side) {
  return doc[`${side}_clears_later`] && !doc[`${side}_cleared_on`];
}

// Manager's transfer document: Date, Reference, description, then Account / Outflows / Inflows.
function TransferDocument({ doc, business }) {
  const rows = [
    { side: 'from', name: doc.from_bank_account_name, outflow: doc.amount, inflow: null },
    { side: 'to', name: doc.to_bank_account_name, outflow: null, inflow: doc.amount },
  ];
  return (
    <DocumentPaper>
      <DocumentHeader
        title={TITLE}
        status={doc.status !== JE_STATUS.posted && <StatusBadge status={doc.status} />}
        business={business}
        meta={[['Reference', doc.reference], ['Date', <FormattedDate key="d" value={doc.date} />]]}
      />
      <DocumentDescription text={doc.description} />
      <Table cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead className="text-end">Outflows</TableHead>
            <TableHead className="text-end">Inflows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.side}>
              <TableCell>
                <span className="flex items-center gap-2">{row.name}{isPending(doc, row.side) && <PendingBadge />}</span>
              </TableCell>
              <TableCell className="num w-32"><Money value={row.outflow} tone="out" /></TableCell>
              <TableCell className="num w-32"><Money value={row.inflow} tone="in" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DocumentPaper>
  );
}

// ?tab=inter-account-transfers&view=<id>
export default function TransferView({ business, docId, rights }) {
  const navigate = useTabNavigate(BANKING_TABS.transfers);
  const { data, error, reload } = useLoad(
    () => getTransfer(business.id, docId),
    [business.id, docId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const doc = data;

  return (
    <DocumentViewFrame
      businessId={business.id}
      title={doc.reference ? `${TITLE} ${doc.reference}` : TITLE}
      doc={doc}
      rights={rights}
      noun="transfer"
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      onClone={() => navigate({ new: 1, clone: doc.id })}
      postCall={(version, key) => postTransfer(business.id, doc.id, version, key)}
      voidCall={(version, key) => voidTransfer(business.id, doc.id, version, key)}
      onChanged={reload}
    >
      <TransferDocument doc={doc} business={business} />
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
