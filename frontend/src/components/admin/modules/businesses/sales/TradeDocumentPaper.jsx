'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate, useBusinessFormat } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import { isZeroAmount } from '../coa/coa-tree';
import { accountLabel } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, documentHref } from '../banking/banking-parts';
import { DOC_TYPES, LATE_FEE_TYPE, ORDER_DELIVERY_STATUS, ORDER_INVOICE_STATUS, ROLES, plainNumber } from './sales-documents';
import { STICKY_CELL, StatusPill } from './sales-parts';
import DocumentHeader, { DocumentDescription, DocumentPaper } from '../documents/DocumentHeader';
import { asReduction, totalsOfDoc, totalsRows } from './TradeTotals';

function DocumentLabel({ entry: { document_type: type, reference, date } }) {
  const { dateFormat } = useBusinessFormat();
  return [DOCUMENT_TYPE_LABELS[type] ?? type, reference, date && formatDate(date, dateFormat)].filter(Boolean).join(' — ');
}

function DocLink({ entry, children }) {
  return <Link href={documentHref(entry.document_type, entry.document_id)} className="hover:text-link hover:underline">{children}</Link>;
}

// The visible line columns: only what the document uses (Manager hides empty ones).
function lineColumns(doc, config) {
  const lines = doc.lines;
  return [
    lines.some((line) => line.item_id) && ['item', 'Item'],
    config.accounts && ['account', 'Account'],
    lines.some((line) => line.description) && ['description', 'Description'],
    ['qty', 'Qty'],
    config.priced && ['unit_price', 'Unit price'],
    config.priced && doc.discount_type && ['discount', 'Discount'],
    config.priced && lines.some((line) => line.tax_code_id) && ['tax', 'Tax'],
    config.priced && ['total', 'Total'],
  ].filter(Boolean);
}

const NUMERIC = new Set(['qty', 'unit_price', 'discount', 'total']);

function cellValue(key, line) {
  if (key === 'item') return line.item_name;
  if (key === 'account') return line.account_id ? accountLabel(line) : '';
  if (key === 'description') return line.description;
  if (key === 'qty') return plainNumber(line.qty);
  if (key === 'tax') return line.tax_reverse_charge ? `${line.tax_code_name} (reverse charge)` : line.tax_code_name;
  return <Money value={line[key]} />;
}

function SummaryRow({ span, label, value, strong, children }) {
  return (
    <TableRow className={cn('hover:bg-transparent', !strong && 'font-normal')}>
      <TableCell colSpan={span} className="text-end">{children ?? label}</TableCell>
      <TableCell className="num">{value}</TableCell>
    </TableRow>
  );
}

// Totals under the lines; invoices add what was applied to them, late fees and the balance due.
function TotalsRows({ doc, config, span }) {
  return (
    <>
      {totalsRows(totalsOfDoc(doc)).map((row) => (
        <SummaryRow key={row.key} span={span} label={row.label} value={<Money value={row.value} />} strong={row.strong} />
      ))}
      {config.role === ROLES.invoice && (
        <>
          {(doc.applied ?? []).map((entry) => (
            <SummaryRow key={`a-${entry.document_id}`} span={span} value={<Money value={asReduction(entry.amount)} />}>
              {entry.is_credit_application && 'Credit applied · '}
              <DocLink entry={entry}><DocumentLabel entry={entry} /></DocLink>
              {entry.early_discount && !isZeroAmount(entry.early_discount) && (
                <span className="text-muted-foreground"> (early payment discount <Money value={entry.early_discount} />)</span>
              )}
            </SummaryRow>
          ))}
          {(doc.late_fees ?? []).map((fee) => {
            const entry = { ...fee, document_type: LATE_FEE_TYPE };
            return (
              <SummaryRow key={`f-${fee.document_id}`} span={span} value={<Money value={fee.amount} />}>
                <DocLink entry={entry}><DocumentLabel entry={entry} /></DocLink>
              </SummaryRow>
            );
          })}
          {doc.balance_due !== null && <SummaryRow span={span} label="Balance due" value={<Money value={doc.balance_due} />} strong />}
        </>
      )}
    </>
  );
}

function LinesTable({ doc, config }) {
  const columns = lineColumns(doc, config);
  return (
    <Table cards={false}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map(([key, label], index) => (
            <TableHead key={key} className={cn(NUMERIC.has(key) && 'text-end', index === 0 && STICKY_CELL)}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {doc.lines.map((line) => (
          <TableRow key={line.id}>
            {columns.map(([key], index) => (
              <TableCell key={key} className={cn(NUMERIC.has(key) ? 'num w-28' : 'min-w-32', key === 'description' && 'text-muted-foreground', index === 0 && STICKY_CELL)}>
                {cellValue(key, line)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {config.priced && (
        <TableFooter>
          <TotalsRows doc={doc} config={config} span={columns.length - 1} />
        </TableFooter>
      )}
    </Table>
  );
}

// Number, dates, location and order statuses: the meta column of the header.
function metaRows(doc, config, locationName) {
  const isType = (type) => config.type === type;
  const isRole = (role) => config.role === role;
  const date = (value) => value && <FormattedDate value={value} />;
  return [
    [isRole(ROLES.invoice) ? 'Invoice number' : 'Reference', doc.reference],
    [config.dateLabel, date(doc.date)],
    isType(DOC_TYPES.quote) && ['Expiry date', date(doc.expiry_date)],
    isRole(ROLES.invoice) && ['Due date', date(doc.due_date)],
    isRole(ROLES.note) && [config.side.invoiceLabel, doc.invoice_reference ?? 'Automatic'],
    ['Inventory location', locationName],
    isType(DOC_TYPES.order) && ['Invoicing', <StatusPill key="i" statuses={ORDER_INVOICE_STATUS} status={doc.invoice_status} />],
    isType(DOC_TYPES.order) && ['Delivery', <StatusPill key="d" statuses={ORDER_DELIVERY_STATUS} status={doc.delivery_status} />],
  ].filter(Boolean);
}

function Links({ links }) {
  if (links.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-muted-foreground" data-print-hide="">
      {links.map((link) => (
        <li key={`${link.relation}-${link.document_id}`}>
          {link.relation === 'source' ? 'Created from ' : 'Copied to '}
          <DocLink entry={link}>{DOCUMENT_TYPE_LABELS[link.document_type]} {link.reference}</DocLink>
        </li>
      ))}
    </ul>
  );
}

// Manager's document layout: business, customer / supplier, meta, lines, totals, applied amounts.
// partyRecord: the customer / supplier record (email, code) when the user may read it.
export default function TradeDocumentPaper({ doc, config, business, partyRecord = null, locationName = null }) {
  const address = config.type === DOC_TYPES.deliveryNote ? doc.delivery_address : doc.billing_address;
  const status = (
    <>
      <StatusPill statuses={config.statuses} status={doc.display_status} />
      {doc.is_closed && <Badge variant="neutral">Closed</Badge>}
    </>
  );
  return (
    <DocumentPaper>
      <DocumentHeader
        title={doc.is_starting_balance ? 'Starting-balance invoice' : config.paperTitle}
        status={status}
        business={business}
        party={{ label: config.side.partyLabel, name: doc[config.side.partyNameField], address: address || null, record: partyRecord }}
        meta={metaRows(doc, config, locationName)}
      />
      <DocumentDescription text={doc.description} />
      <LinesTable doc={doc} config={config} />
      {doc.is_starting_balance && (
        <p className="text-sm text-muted-foreground">Paid before start: <Money value={doc.paid_before_start} /></p>
      )}
      {doc.early_discount && (
        <p className="text-sm text-muted-foreground">
          Early payment discount of <Money value={doc.early_discount.amount} /> if paid by <FormattedDate value={doc.early_discount.until} />.
        </p>
      )}
      {doc.acts_as_stock_movement && config.stockMovementLabel && (
        <p className="text-sm text-muted-foreground">{config.stockMovementLabel}.</p>
      )}
      {config.role === ROLES.note && doc.applied?.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {doc.applied.map((entry) => (
            <li key={entry.document_id}>
              Applied to <DocLink entry={entry}><DocumentLabel entry={entry} /></DocLink>: <Money value={entry.amount} />
            </li>
          ))}
        </ul>
      )}
      <Links links={doc.links ?? []} />
    </DocumentPaper>
  );
}
