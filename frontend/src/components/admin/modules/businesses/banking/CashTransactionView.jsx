'use client';

import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate, Quantity } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import TransactionJournal from '../ledger/TransactionJournal';
import { ErrorAlert, JE_STATUS, StatusBadge, accountLabel, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from './AttachmentsPanel';
import { DocumentSkeleton, NO_BANK_LABEL, PendingBadge, useLoad } from './banking-parts';
import DocumentViewFrame from './DocumentViewFrame';
import ReceiptAllocations from '../sales/ReceiptAllocations';

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children || '—'}</dd>
    </div>
  );
}

function lineAccount(line) {
  return [accountLabel(line), line.party_name, line.invoice_reference].filter(Boolean).join(' — ');
}

// Manager's receipt / payment document: header fields, then Account / Description / Qty / Amount / Total.
function CashDocument({ doc, direction, businessName }) {
  return (
    <Card className="p-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{direction.title}</h2>
          {doc.status !== JE_STATUS.posted && <StatusBadge status={doc.status} />}
          {doc.is_pending && <PendingBadge />}
        </div>
        <p className="font-semibold">{businessName}</p>
      </div>
      <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date"><FormattedDate value={doc.date} className="tabular-nums" /></Field>
        <Field label="Reference">{doc.reference}</Field>
        <Field label={direction.bankLabel}>{doc.bank_account_name ?? NO_BANK_LABEL}</Field>
        <Field label={direction.counterpartyLabel}>{doc.counterparty}</Field>
        {doc.clears_later && <Field label="Cleared">{doc.cleared_on ? <FormattedDate value={doc.cleared_on} /> : 'Not cleared yet'}</Field>}
      </dl>
      {doc.description && <p className="mt-6 font-semibold whitespace-pre-wrap">{doc.description}</p>}
      <Table className="mt-4">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-end">Qty</TableHead>
            <TableHead className="text-end">Amount</TableHead>
            <TableHead className="text-end">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {doc.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell data-card="title">{lineAccount(line)}</TableCell>
              <TableCell className="text-muted-foreground" data-label="Description">{line.description}</TableCell>
              <TableCell className="num w-20" data-label="Qty"><Quantity value={line.qty} /></TableCell>
              <TableCell className="num w-32" data-label="Amount"><Money value={line.unit_price} /></TableCell>
              <TableCell className="num w-32" data-card="end"><Money value={line.amount} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={4} className="text-end max-md:text-start">Total</TableCell>
            <TableCell className="num" data-testid="document-total"><Money value={doc.total} /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

// ?tab=receipts|payments&view=<id>: the document, Edit / Post / Void, its Transaction Journal and attachments.
export default function CashTransactionView({ business, direction, docId, rights }) {
  const navigate = useTabNavigate(direction.tab);
  const { service } = direction;
  const { data, error, reload } = useLoad(
    () => service.get(business.id, docId),
    [business.id, direction.tab, docId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const doc = data;

  return (
    <DocumentViewFrame
      title={doc.reference ? `${direction.title} ${doc.reference}` : direction.title}
      doc={doc}
      rights={rights}
      noun={direction.noun}
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      postCall={(version, key) => service.post(business.id, doc.id, version, key)}
      voidCall={(version, key) => service.void(business.id, doc.id, version, key)}
      onChanged={reload}
    >
      <CashDocument doc={doc} direction={direction} businessName={business.name} />
      <ReceiptAllocations doc={doc} side={direction.side} />
      <TransactionJournal businessId={business.id} documentId={doc.id} version={doc.version} />
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
