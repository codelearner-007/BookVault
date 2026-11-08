'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import { isZeroAmount } from '../coa/coa-tree';
import { accountLabel } from '../ledger/ledger-parts';
import { DOCUMENT_TYPE_LABELS, documentHref } from '../banking/banking-parts';
import { DOC_TYPES, LATE_FEE_TYPE, ORDER_DELIVERY_STATUS, ORDER_INVOICE_STATUS, ROLES, plainNumber } from './sales-documents';
import { Field, STICKY_CELL, StatusPill } from './sales-parts';

// Applied receipts / payments / notes reduce what the invoice is owed: shown with a minus like Manager. Text only.
function asReduction(value) {
  const text = String(value);
  return text.startsWith('-') ? formatMoney(text) : `-${formatMoney(text)}`;
}

function documentLabel({ document_type: type, reference, date }) {
  return [DOCUMENT_TYPE_LABELS[type] ?? type, reference, date].filter(Boolean).join(' — ');
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
  if (key === 'tax') return line.tax_code_name;
  return formatMoney(line[key]);
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
  const breakdown = doc.tax_breakdown ?? [];
  const showSubtotal = breakdown.length > 0;
  return (
    <>
      {showSubtotal && <SummaryRow span={span} label="Subtotal" value={formatMoney(doc.subtotal)} />}
      {breakdown.map((tax) => (
        <SummaryRow key={tax.tax_code_id} span={span} label={`${tax.name} ${plainNumber(tax.rate)}%`} value={formatMoney(tax.amount)} />
      ))}
      {!isZeroAmount(doc.rounding) && <SummaryRow span={span} label="Rounding" value={formatMoney(doc.rounding)} />}
      <SummaryRow span={span} label="Total" value={formatMoney(doc.total)} strong />
      {config.role === ROLES.invoice && (
        <>
          {(doc.applied ?? []).map((entry) => (
            <SummaryRow key={`a-${entry.document_id}`} span={span} value={asReduction(entry.amount)}>
              <DocLink entry={entry}>{documentLabel(entry)}</DocLink>
              {entry.early_discount && !isZeroAmount(entry.early_discount) && (
                <span className="text-muted-foreground"> (early payment discount {formatMoney(entry.early_discount)})</span>
              )}
            </SummaryRow>
          ))}
          {(doc.late_fees ?? []).map((fee) => {
            const entry = { ...fee, document_type: LATE_FEE_TYPE };
            return (
              <SummaryRow key={`f-${fee.document_id}`} span={span} value={formatMoney(fee.amount)}>
                <DocLink entry={entry}>{documentLabel(entry)}</DocLink>
              </SummaryRow>
            );
          })}
          {doc.balance_due !== null && <SummaryRow span={span} label="Balance due" value={formatMoney(doc.balance_due)} strong />}
        </>
      )}
    </>
  );
}

function LinesTable({ doc, config }) {
  const columns = lineColumns(doc, config);
  return (
    <Table className="mt-4" cards={false}>
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

function HeaderFields({ doc, config }) {
  const isType = (type) => config.type === type;
  const isRole = (role) => config.role === role;
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={config.dateLabel}><span className="tabular-nums">{doc.date}</span></Field>
      {isType(DOC_TYPES.quote) && doc.expiry_date && <Field label="Expiry date"><span className="tabular-nums">{doc.expiry_date}</span></Field>}
      {isRole(ROLES.invoice) && <Field label="Due date"><span className="tabular-nums">{doc.due_date}</span></Field>}
      <Field label={isRole(ROLES.invoice) ? 'Invoice number' : 'Reference'}>{doc.reference}</Field>
      {isRole(ROLES.note) && <Field label={config.side.invoiceLabel}>{doc.invoice_reference ?? 'Automatic'}</Field>}
      {isType(DOC_TYPES.order) && (
        <Field label="Status">
          <span className="flex flex-wrap gap-2">
            <StatusPill statuses={ORDER_INVOICE_STATUS} status={doc.invoice_status} />
            <StatusPill statuses={ORDER_DELIVERY_STATUS} status={doc.delivery_status} />
          </span>
        </Field>
      )}
    </dl>
  );
}

function Links({ links }) {
  if (links.length === 0) return null;
  return (
    <ul className="mt-6 space-y-1 text-sm text-muted-foreground">
      {links.map((link) => (
        <li key={`${link.relation}-${link.document_id}`}>
          {link.relation === 'source' ? 'Created from ' : 'Copied to '}
          <DocLink entry={link}>{DOCUMENT_TYPE_LABELS[link.document_type]} {link.reference}</DocLink>
        </li>
      ))}
    </ul>
  );
}

// Manager's document layout: title and status, customer / supplier and address, dates, lines, totals, applied amounts.
export default function TradeDocumentPaper({ doc, config, businessName }) {
  const address = config.type === DOC_TYPES.deliveryNote ? doc.delivery_address : doc.billing_address;
  return (
    <Card className="p-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">{doc.is_starting_balance ? 'Starting-balance invoice' : config.paperTitle}</h2>
          <StatusPill statuses={config.statuses} status={doc.display_status} />
          {doc.is_closed && <Badge variant="neutral">Closed</Badge>}
        </div>
        <p className="font-semibold">{businessName}</p>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <p className="font-semibold">{doc[config.side.partyNameField]}</p>
          {address && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{address}</p>}
        </div>
        <HeaderFields doc={doc} config={config} />
      </div>
      {doc.description && <p className="mt-6 font-semibold whitespace-pre-wrap">{doc.description}</p>}
      <LinesTable doc={doc} config={config} />
      {doc.is_starting_balance && (
        <p className="mt-4 text-sm text-muted-foreground">Paid before start: <span className="num">{formatMoney(doc.paid_before_start)}</span></p>
      )}
      {doc.early_discount && (
        <p className="mt-4 text-sm text-muted-foreground">
          Early payment discount of {formatMoney(doc.early_discount.amount)} if paid by {doc.early_discount.until}.
        </p>
      )}
      {doc.acts_as_stock_movement && config.stockMovementLabel && (
        <p className="mt-4 text-sm text-muted-foreground">{config.stockMovementLabel}.</p>
      )}
      {config.role === ROLES.note && doc.applied?.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {doc.applied.map((entry) => (
            <li key={entry.document_id}>
              Applied to <DocLink entry={entry}>{documentLabel(entry)}</DocLink>: <span className="num">{formatMoney(entry.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <Links links={doc.links ?? []} />
    </Card>
  );
}
