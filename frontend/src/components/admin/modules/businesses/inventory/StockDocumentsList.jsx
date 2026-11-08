'use client';

import { PackageOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLUMN_KIND, ListTable } from '@/components/common/list-table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, isEditableDocument, useLoad } from '../banking/banking-parts';
import { StatusPill, useUrlSearch } from '../sales/sales-parts';

// One list-table column per config column key, in Manager's order.
function listColumn([key, label], config) {
  switch (key) {
    case 'date': return { key, label, kind: COLUMN_KIND.date };
    case 'reference': return { key, label, card: 'title', value: (row) => row.reference || config.title };
    case 'from': return { key, label, value: (row) => row.location_name };
    case 'to': return { key, label, value: (row) => row.to_location_name };
    case 'description': return { key, label, muted: true, truncate: true };
    case 'items': return { key, label, truncate: true, value: (row) => row.item_names };
    case 'finishedItem': return { key, label, value: (row) => row.finished_item_name };
    case 'qty': return { key, label, kind: COLUMN_KIND.qty };
    case 'totalCost': return { key, label, kind: COLUMN_KIND.money, card: 'end', value: (row) => row.total_cost };
    case 'status': return { key, label, render: (row) => <StatusPill statuses={config.statuses} status={row.display_status} /> };
    default: return null;
  }
}

// ?tab=<stock tab>[&q=search][&p=N]: Manager's columns for the type, the server's total cost, search and pages.
export default function StockDocumentsList({ businessId, config, page, search, active, canCreate, canEdit }) {
  const navigate = useTabNavigate(config.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => config.service.list(businessId, { page, search }), [businessId, config.type, page, search, active]);

  const columns = config.columns.map((column) => listColumn(column, config));
  if (!data && !error) return <TableSkeleton columns={columns.length} actions />;
  const items = data?.items ?? [];
  const plural = config.plural.toLowerCase();

  return (
    <div>
      <PageHeader
        title={config.plural}
        actions={canCreate && (
          <Button onClick={() => navigate({ new: 1 })}>
            <Plus />
            New {config.title}
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${plural}`} />
      </ListToolbar>
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ q: search, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={PackageOpen} title={search ? 'Nothing matches this search' : `No ${plural} yet`} />
        ) : (
          <ListTable
            columns={columns}
            rows={items}
            totals={columns.some(({ key }) => key === 'totalCost') ? { totalCost: data.total_cost } : undefined}
            onView={(row) => navigate({ q: search, view: row.id })}
            onEdit={canEdit ? (row) => navigate({ q: search, edit: row.id }) : null}
            canEdit={isEditableDocument}
          />
        )}
      </ListCard>
    </div>
  );
}
