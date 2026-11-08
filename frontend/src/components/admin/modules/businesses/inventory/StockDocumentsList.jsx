'use client';

import { PackageOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad } from '../banking/banking-parts';
import { plainNumber } from '../sales/sales-documents';
import { STICKY_KEY, StatusPill, useUrlSearch } from '../sales/sales-parts';

const NUMERIC = new Set(['qty', 'totalCost']);
const TOTAL_COST = 'totalCost';

// One list cell per column key (config.columns), with the card-layout hints used on phones; the reference opens it.
function cell([key, label], row, config, onOpen) {
  switch (key) {
    case 'date': return <TableCell key={key} className="num whitespace-nowrap" data-label={label}>{row.date}</TableCell>;
    case 'reference':
      return (
        <TableCell key={key} data-card="title" className={STICKY_KEY}>
          <Button variant="link" className="text-inherit hover:text-link" onClick={(event) => { event.stopPropagation(); onOpen(row.id); }}>
            {row.reference || config.title}
          </Button>
        </TableCell>
      );
    case 'from': return <TableCell key={key} data-label={label}>{row.location_name}</TableCell>;
    case 'to': return <TableCell key={key} data-label={label}>{row.to_location_name}</TableCell>;
    case 'description': return <TableCell key={key} className="max-w-md truncate text-muted-foreground" data-label={label}>{row.description}</TableCell>;
    case 'items': return <TableCell key={key} className="max-w-sm truncate" data-label={label}>{row.item_names}</TableCell>;
    case 'finishedItem': return <TableCell key={key} data-label={label}>{row.finished_item_name}</TableCell>;
    case 'qty': return <TableCell key={key} className="num" data-label={label}>{plainNumber(row.qty)}</TableCell>;
    case 'totalCost': return <TableCell key={key} className="num" data-card="end">{formatMoney(row.total_cost)}</TableCell>;
    case 'status': return <TableCell key={key} data-label={label}><StatusPill statuses={config.statuses} status={row.display_status} /></TableCell>;
    default: return null;
  }
}

// The server's total cost of the posted documents under its column (write-offs, production orders).
function TotalsRow({ columns, total }) {
  if (!columns.some(([key]) => key === TOTAL_COST)) return null;
  return (
    <TableFooter>
      <TableRow className="hover:bg-transparent">
        {columns.map(([key], index) => (
          <TableCell key={key} className={cn(key === TOTAL_COST && 'num', key !== TOTAL_COST && index > 0 && 'max-md:hidden')}>
            {index === 0 ? 'Total' : key === TOTAL_COST ? formatMoney(total) : null}
          </TableCell>
        ))}
      </TableRow>
    </TableFooter>
  );
}

function DocumentsTable({ config, data, onOpen }) {
  const { columns } = config;
  return (
    <Table data-testid={`${config.tab}-table`}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map(([key, label]) => (
            <TableHead key={key} className={cn(NUMERIC.has(key) && 'text-end', key === 'reference' && STICKY_KEY)}>{label}</TableHead>
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
      <TotalsRow columns={columns} total={data.total_cost} />
    </Table>
  );
}

// ?tab=<stock tab>[&q=search][&p=N]: Manager's columns for the type, the server's total cost, search and pages.
export default function StockDocumentsList({ businessId, config, page, search, active, canCreate }) {
  const navigate = useTabNavigate(config.tab);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => config.service.list(businessId, { page, search }), [businessId, config.type, page, search, active]);

  if (!data && !error) return <TableSkeleton columns={config.columns.length} />;
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
          <DocumentsTable config={config} data={data} onOpen={(id) => navigate({ q: search, view: id })} />
        )}
      </ListCard>
    </div>
  );
}
