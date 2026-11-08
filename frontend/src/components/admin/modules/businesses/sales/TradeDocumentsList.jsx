'use client';

import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listEarlyPaymentDiscounts } from '@/lib/services/trade-documents.service';
import { ErrorAlert, todayIso, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, isEditableDocument, useLoad } from '../banking/banking-parts';
import { DOC_TYPES, ORDER_DELIVERY_STATUS, ORDER_INVOICE_STATUS } from './sales-documents';
import { StatusPill, useUrlSearch } from './sales-parts';

const hasReference = (config) => config.columns.some(([key]) => key === 'reference');

// One column definition per config.columns key, with the phone-card slots. The reference is the record's title;
// types listed without a reference (debit notes, goods receipts) are titled by their party.
function tradeColumn([key, label], config) {
  const partyName = (row) => row[config.side.partyNameField];
  switch (key) {
    case 'date': return { key, label, kind: COLUMN_KIND.date };
    case 'reference': return { key, label, card: 'title', value: (row) => row.reference || config.title };
    case 'party':
      return hasReference(config)
        ? { key, label, value: partyName }
        : { key, label, card: 'title', value: (row) => partyName(row) || config.title };
    case 'source': return { key, label, muted: true, value: (row) => row.source_reference };
    case 'invoice': return { key, label, muted: true, value: (row) => row.invoice_reference };
    case 'description': return { key, label: 'Description', muted: true, truncate: true };
    case 'total': return { key, label, kind: COLUMN_KIND.money, card: 'end' };
    case 'balanceDue': return { key, label, kind: COLUMN_KIND.money, value: (row) => row.balance_due };
    case 'status':
      return { key, label: 'Status', render: (row) => <StatusPill statuses={config.statuses} status={row.display_status} /> };
    case 'invoiceStatus':
      return { key, label, render: (row) => <StatusPill statuses={ORDER_INVOICE_STATUS} status={row.invoice_status} /> };
    case 'deliveryStatus':
      return { key, label, render: (row) => <StatusPill statuses={ORDER_DELIVERY_STATUS} status={row.delivery_status} /> };
    default: return null;
  }
}

// Totals row: the server's total_amount (and total_balance_due on invoices) under their columns.
function tradeTotals(columns, data) {
  const totals = {};
  if (columns.some(({ key }) => key === 'total')) totals.total = data.total_amount;
  if (columns.some(({ key }) => key === 'balanceDue')) totals.balanceDue = data.total_balance_due;
  return Object.keys(totals).length > 0 ? totals : undefined;
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
export default function TradeDocumentsList({ businessId, config, page, search, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(config.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => config.service.list(businessId, { page, search }), [businessId, config.type, page, search, active]);
  const showDiscounts = useDiscountsLink(businessId, config, active);


  const columns = config.columns.map((column) => tradeColumn(column, config)).filter(Boolean);
  if (!data && !error) return <TableSkeleton columns={columns.length} actions />;

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
          <ListTable
            columns={columns}
            rows={items}
            totals={tradeTotals(columns, data)}
            onView={(row) => navigate({ q: search, view: row.id })}
            onEdit={canEdit ? (row) => navigate({ q: search, edit: row.id }) : null}
            canEdit={isEditableDocument}
            // Closed purchase invoices stay listed (sorted last by the server), muted.
            rowClassName={(row) => row.is_closed && 'text-muted-foreground'}
          />
        )}
      </ListCard>
    </div>
  );
}
