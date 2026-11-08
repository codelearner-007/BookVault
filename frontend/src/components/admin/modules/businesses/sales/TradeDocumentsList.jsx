'use client';

import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listEarlyPaymentDiscounts } from '@/lib/services/trade-documents.service';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import { ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad } from '../banking/banking-parts';
import { DOC_TYPES, ORDER_DELIVERY_STATUS, ORDER_INVOICE_STATUS } from './sales-documents';
import { STICKY_KEY, StatusPill, useUrlSearch } from './sales-parts';

const MONEY_COLUMNS = new Set(['total', 'balanceDue']);

// One list cell per column key (config.columns), with the card-layout hints used on phones.
function cell([key, label], row, config, onOpen) {
  switch (key) {
    case 'date': return <TableCell key={key} className="num whitespace-nowrap" data-label={label}>{row.date}</TableCell>;
    case 'reference':
      return (
        <TableCell key={key} data-card="title" className={STICKY_KEY}>
          <Button variant="link" className="text-foreground hover:text-link" onClick={(event) => { event.stopPropagation(); onOpen(row.id); }}>
            {row.reference || config.title}
          </Button>
        </TableCell>
      );
    case 'customer': return <TableCell key={key} data-label="Customer">{row.customer_name}</TableCell>;
    case 'source': return <TableCell key={key} className="text-muted-foreground" data-label={label}>{row.source_reference}</TableCell>;
    case 'invoice': return <TableCell key={key} className="text-muted-foreground" data-label={label}>{row.invoice_reference}</TableCell>;
    case 'description': return <TableCell key={key} className="max-w-md truncate text-muted-foreground" data-label="Description">{row.description}</TableCell>;
    case 'total': return <TableCell key={key} className="num" data-card="end">{formatMoney(row.total)}</TableCell>;
    case 'balanceDue': return <TableCell key={key} className="num" data-label={label}>{formatMoney(row.balance_due)}</TableCell>;
    case 'status': return <TableCell key={key} data-label="Status"><StatusPill statuses={config.statuses} status={row.display_status} /></TableCell>;
    case 'invoiceStatus': return <TableCell key={key} data-label={label}><StatusPill statuses={ORDER_INVOICE_STATUS} status={row.invoice_status} /></TableCell>;
    case 'deliveryStatus': return <TableCell key={key} data-label={label}><StatusPill statuses={ORDER_DELIVERY_STATUS} status={row.delivery_status} /></TableCell>;
    default: return null;
  }
}

// Totals row: the server's total_amount (and total_balance_due on invoices) under their columns.
function TotalsRow({ columns, data }) {
  const totals = { total: data.total_amount, balanceDue: data.total_balance_due };
  if (!columns.some(([key]) => MONEY_COLUMNS.has(key))) return null;
  return (
    <TableFooter>
      <TableRow className="hover:bg-transparent">
        {columns.map(([key, label], index) => (
          <TableCell key={key} className={cn(MONEY_COLUMNS.has(key) && 'num', !MONEY_COLUMNS.has(key) && index > 0 && 'max-md:hidden')} data-label={MONEY_COLUMNS.has(key) ? label : undefined}>
            {index === 0 ? 'Total' : MONEY_COLUMNS.has(key) ? formatMoney(totals[key]) : null}
          </TableCell>
        ))}
      </TableRow>
    </TableFooter>
  );
}

function DocumentsTable({ config, data, onOpen }) {
  const { columns } = config;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map(([key, label]) => (
            <TableHead key={key} className={cn(MONEY_COLUMNS.has(key) && 'text-end', key === 'reference' && STICKY_KEY)}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((row) => (
          <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row.id)}>
            {columns.map((column) => cell(column, row, config, onOpen))}
          </TableRow>
        ))}
      </TableBody>
      <TotalsRow columns={columns} data={data} />
    </Table>
  );
}

// "Discounts available" next to New Sales Invoice, only while some invoice still has an early payment discount.
function useDiscountsLink(businessId, config, active) {
  const isInvoice = config.type === DOC_TYPES.invoice;
  const { data } = useLoad(
    () => (isInvoice ? listEarlyPaymentDiscounts(businessId, todayIso()) : Promise.resolve(null)),
    [businessId, isInvoice, active],
  );
  return data?.total > 0;
}

// ?tab=<type tab>[&q=search][&p=N]: Manager's columns for the type, server totals, search and pages.
export default function TradeDocumentsList({ businessId, config, page, search, active, canCreate }) {
  const navigate = useTabNavigate(config.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => config.service.list(businessId, { page, search }), [businessId, config.type, page, search, active]);
  const showDiscounts = useDiscountsLink(businessId, config, active);


  if (!data && !error) return <TableSkeleton columns={config.columns.length} />;

  const actions = (
    <>
      {showDiscounts && <Button variant="ghost" onClick={() => navigate({ discounts: 1 })}>Discounts available</Button>}
      {canCreate && (
        <Button onClick={() => navigate({ new: 1 })}>
          <Plus />
          New {config.title}
        </Button>
      )}
    </>
  );
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader title={config.plural} actions={actions} />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${config.plural.toLowerCase()}`}
        />
      </ListToolbar>
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination
            page={page}
            totalPages={Math.max(1, data.total_pages)}
            total={data.total}
            onPage={(next) => navigate({ q: search, p: next > 1 ? next : null })}
          />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={FileText} title={search ? 'Nothing matches this search' : `No ${config.plural.toLowerCase()} yet`} />
        ) : (
          <DocumentsTable config={config} data={data} onOpen={(id) => navigate({ q: search, view: id })} />
        )}
      </ListCard>
    </div>
  );
}
