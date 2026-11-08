'use client';

import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate, Quantity } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { PARTY_KINDS } from '@/lib/services/parties.service';
import { cn } from '@/lib/utils';
import { isZeroAmount } from '../coa/coa-tree';
import { JE_STATUS, StatusBadge, accountLabel } from '../ledger/ledger-parts';
import { NO_BANK_LABEL, PendingBadge, documentHref } from './banking-parts';
import DocumentHeader, { DocumentDescription, DocumentPaper } from '../documents/DocumentHeader';

// Counterparty kinds that have their own record view (capital accounts have none).
const PARTY_TABS = { [PARTY_KINDS.customer]: 'customers', [PARTY_KINDS.supplier]: 'suppliers' };
const LINK_CLASS = 'text-link underline-offset-4 hover:underline';
const NUMERIC = new Set(['qty', 'unit_price', 'discount', 'amount']);

function Counterparty({ doc }) {
  const tab = PARTY_TABS[doc.counterparty_kind];
  if (!tab || !doc.counterparty_party_id) return doc.counterparty;
  return <Link href={`?tab=${tab}&view=${doc.counterparty_party_id}`} className={LINK_CLASS}>{doc.counterparty}</Link>;
}

function ClearedValue({ doc }) {
  return doc.cleared_on ? <FormattedDate value={doc.cleared_on} className="tabular-nums" /> : 'Not cleared yet';
}

// The visible line columns: only what the document uses, so a filled document shows every value it has.
function lineColumns(lines) {
  const has = (key) => lines.some((line) => line[key] !== null && line[key] !== '' && !(NUMERIC.has(key) && isZeroAmount(line[key])));
  return [
    ['account', 'Account'],
    has('description') && ['description', 'Description'],
    has('qty') && ['qty', 'Qty'],
    ['unit_price', 'Amount'],
    has('discount') && ['discount', 'Discount'],
    ['amount', 'Total'],
  ].filter(Boolean);
}

// Account, then the sub-ledger party and the invoice the line pays (linked), muted underneath.
function AccountCell({ line, invoiceType }) {
  return (
    <>
      <span className="font-medium">{accountLabel(line)}</span>
      {(line.party_name || line.invoice_id) && (
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {line.party_name}
          {line.party_name && line.invoice_id && ' · '}
          {line.invoice_id && (
            <Link href={documentHref(invoiceType, line.invoice_id)} className={LINK_CLASS}>{line.invoice_reference || 'Invoice'}</Link>
          )}
        </span>
      )}
    </>
  );
}

function cellValue(key, line, invoiceType) {
  if (key === 'account') return <AccountCell line={line} invoiceType={invoiceType} />;
  if (key === 'description') return line.description;
  if (key === 'qty') return <Quantity value={line.qty} />;
  if (key === 'discount') return <Money value={line.discount} zero="blank" />;
  return <Money value={line[key]} />;
}

function LinesTable({ lines, invoiceType }) {
  const columns = lineColumns(lines);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map(([key, label]) => <TableHead key={key} className={cn(NUMERIC.has(key) && 'text-end')}>{label}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            {columns.map(([key, label]) => (
              <TableCell
                key={key}
                className={cn(NUMERIC.has(key) && 'num w-28', key === 'description' && 'whitespace-pre-wrap text-muted-foreground')}
                data-card={key === 'account' ? 'title' : key === 'amount' ? 'end' : undefined}
                data-label={key === 'account' || key === 'amount' ? undefined : label}
              >
                {cellValue(key, line, invoiceType)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DocumentStatus({ doc }) {
  return (
    <>
      {doc.status !== JE_STATUS.posted && <StatusBadge status={doc.status} />}
      {doc.is_pending && <PendingBadge />}
    </>
  );
}

// A receipt / payment like the printed slip: business, payer / payee, meta, description, lines, total.
// partyRecord: the customer / supplier record (email, address) when the counterparty is one.
export default function CashDocumentPaper({ doc, direction, business, partyRecord = null }) {
  const date = (value) => <FormattedDate value={value} />;
  return (
    <DocumentPaper>
      <DocumentHeader
        title={direction.title}
        status={(doc.status !== JE_STATUS.posted || doc.is_pending) && <DocumentStatus doc={doc} />}
        business={business}
        party={doc.counterparty ? { label: direction.counterpartyLabel, name: <Counterparty doc={doc} />, record: partyRecord } : null}
        meta={[
          ['Reference', doc.reference],
          ['Date', date(doc.date)],
          [direction.bankLabel, doc.bank_account_name ?? NO_BANK_LABEL],
          doc.clears_later && ['Cleared', <ClearedValue key="c" doc={doc} />],
        ].filter(Boolean)}
      />
      <DocumentDescription text={doc.description} />
      <LinesTable lines={doc.lines} invoiceType={direction.side.invoiceType} />
      <dl className="ms-auto flex w-full items-baseline justify-between gap-6 border-t border-border pt-4 sm:w-72">
        <dt className="font-semibold">Total</dt>
        <dd className="num text-lg font-semibold" data-testid="document-total"><Money value={doc.total} /></dd>
      </dl>
    </DocumentPaper>
  );
}
