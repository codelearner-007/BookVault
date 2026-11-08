'use client';

import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getDocumentJournal } from '@/lib/services/journal-entries.service';
import { getTransfer, postTransfer, voidTransfer } from '@/lib/services/inter-account-transfers.service';
import { formatMoney } from '@/lib/utils/money';
import TransactionJournal from '../ledger/TransactionJournal';
import { ErrorAlert, JE_STATUS, StatusBadge, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from './AttachmentsPanel';
import { BANKING_TABS, DocumentSkeleton, PendingBadge, useLoad } from './banking-parts';
import DocumentViewFrame from './DocumentViewFrame';

const TITLE = 'Inter Account Transfer';

// A side is pending while it clears later and has no clear date yet.
function isPending(doc, side) {
  return doc[`${side}_clears_later`] && !doc[`${side}_cleared_on`];
}

// Manager's transfer document: Date, Reference, description, then Account / Outflows / Inflows.
function TransferDocument({ doc, businessName }) {
  const rows = [
    { side: 'from', name: doc.from_bank_account_name, outflow: doc.amount, inflow: null },
    { side: 'to', name: doc.to_bank_account_name, outflow: null, inflow: doc.amount },
  ];
  return (
    <Card className="p-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{TITLE}</h2>
          {doc.status !== JE_STATUS.posted && <StatusBadge status={doc.status} />}
        </div>
        <p className="font-semibold">{businessName}</p>
      </div>
      <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Date</dt><dd className="mt-1 tabular-nums">{doc.date}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Reference</dt><dd className="mt-1">{doc.reference || '—'}</dd></div>
      </dl>
      {doc.description && <p className="mt-6 font-semibold whitespace-pre-wrap">{doc.description}</p>}
      <Table className="mt-4" cards={false}>
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
              <TableCell className="num w-32">{formatMoney(row.outflow)}</TableCell>
              <TableCell className="num w-32">{formatMoney(row.inflow)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ?tab=inter-account-transfers&view=<id>
export default function TransferView({ business, docId, rights }) {
  const navigate = useTabNavigate(BANKING_TABS.transfers);
  const { data, error, reload } = useLoad(
    () => Promise.all([getTransfer(business.id, docId), getDocumentJournal(business.id, docId)]),
    [business.id, docId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const [doc, journal] = data;

  return (
    <DocumentViewFrame
      title={doc.reference ? `${TITLE} ${doc.reference}` : TITLE}
      doc={doc}
      rights={rights}
      noun="transfer"
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      postCall={(version, key) => postTransfer(business.id, doc.id, version, key)}
      voidCall={(version, key) => voidTransfer(business.id, doc.id, version, key)}
      onChanged={reload}
    >
      <TransferDocument doc={doc} businessName={business.name} />
      <TransactionJournal journal={journal} />
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
