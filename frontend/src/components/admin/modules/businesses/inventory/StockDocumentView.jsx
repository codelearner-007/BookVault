'use client';

import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate, Quantity } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { cn } from '@/lib/utils';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import AttachmentsPanel from '../banking/AttachmentsPanel';
import { DocumentSkeleton, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import { Field, STICKY_CELL, StatusPill } from '../sales/sales-parts';

const CELLS = {
  code: (line) => line.item_code,
  item: (line) => line.item_name,
  description: (line) => line.description,
  qty: (line) => <Quantity value={line.qty} />,
  account: (line) => line.account_name,
  amount: (line) => <Money value={line.amount} />,
};
const NUMERIC = new Set(['qty', 'amount']);
// Manager's line columns per document; a column no line uses (description) is hidden.
const LINE_COLUMNS = {
  transfer: [['code', 'Item code'], ['item', 'Item name'], ['description', 'Description'], ['qty', 'Qty']],
  writeOff: [['code', 'Item code'], ['item', 'Item name'], ['qty', 'Qty'], ['account', 'Account'], ['description', 'Description'], ['amount', 'Cost']],
  materials: [['qty', 'Qty'], ['item', 'Item'], ['amount', 'Amount']],
  costs: [['account', 'Account'], ['description', 'Description'], ['amount', 'Amount']],
};

// total: the document's total cost, in a footer row under the amount column.
function LinesTable({ label, lines, columns, total }) {
  const shown = columns.filter(([key]) => key !== 'description' || lines.some((line) => line.description));
  return (
    <Table className="mt-4" cards={false} aria-label={label}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {shown.map(([key, title], index) => (
            <TableHead key={key} className={cn(NUMERIC.has(key) && 'text-end', index === 0 && STICKY_CELL)}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            {shown.map(([key], index) => (
              <TableCell key={key} className={cn(NUMERIC.has(key) ? 'num w-28' : 'min-w-32', key === 'description' && 'text-muted-foreground', index === 0 && STICKY_CELL)}>
                {CELLS[key](line)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {total !== undefined && (
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={shown.length - 1} className="text-end">Total cost</TableCell>
            <TableCell className="num"><Money value={total} /></TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

function HeaderFields({ doc, config }) {
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Date"><FormattedDate value={doc.date} /></Field>
      <Field label="Reference">{doc.reference}</Field>
      {config.locations === 'pair' ? (
        <>
          <Field label="From">{doc.location_name}</Field>
          <Field label="To">{doc.to_location_name}</Field>
        </>
      ) : (
        <Field label="Inventory location">{doc.location_name}</Field>
      )}
      {config.production && <Field label="Finished item"><Quantity value={doc.qty} /> × {doc.finished_item_name}</Field>}
    </dl>
  );
}

function DocumentLines({ doc, config }) {
  if (config.production) {
    const hasCosts = doc.costs.length > 0;
    return (
      <>
        <LinesTable label="Bill of materials" lines={doc.lines} columns={LINE_COLUMNS.materials} total={hasCosts ? undefined : doc.total_cost} />
        {hasCosts && <LinesTable label="Non-inventory costs" lines={doc.costs} columns={LINE_COLUMNS.costs} total={doc.total_cost} />}
      </>
    );
  }
  if (config.lineAccount) return <LinesTable label="Lines" lines={doc.lines} columns={LINE_COLUMNS.writeOff} total={doc.total_cost} />;
  return <LinesTable label="Lines" lines={doc.lines} columns={LINE_COLUMNS.transfer} />;
}

function StockDocument({ doc, config, businessName }) {
  return (
    <Card className="p-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">{config.title}</h2>
          <StatusPill statuses={config.statuses} status={doc.display_status} />
        </div>
        <p className="font-semibold">{businessName}</p>
      </div>
      <HeaderFields doc={doc} config={config} />
      {doc.description && <p className="mt-6 font-semibold whitespace-pre-wrap">{doc.description}</p>}
      <DocumentLines doc={doc} config={config} />
    </Card>
  );
}

// ?tab=<stock tab>&view=<id>: the document, Edit / Post / Void and attachments.
export default function StockDocumentView({ business, config, docId, rights }) {
  const navigate = useTabNavigate(config.tab);
  const { service } = config;
  const { data, error, reload } = useLoad(
    () => service.get(business.id, docId),
    [business.id, config.type, docId],
  );

  if (!data) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;
  const doc = data;

  return (
    <DocumentViewFrame
      title={doc.reference ? `${config.title} ${doc.reference}` : config.title}
      doc={doc}
      rights={rights}
      noun={config.noun}
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: doc.id })}
      postCall={(version, key) => service.post(business.id, doc.id, version, key)}
      voidCall={(version, key) => service.void(business.id, doc.id, version, key)}
      onChanged={reload}
      voidCopy={config.voidCopy}
    >
      <StockDocument doc={doc} config={config} businessName={business.name} />
      <AttachmentsPanel businessId={business.id} documentId={doc.id} canEdit={rights.edit && !doc.is_locked} />
    </DocumentViewFrame>
  );
}
