'use client';

import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader, SearchInput } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listCustomers } from '@/lib/services/customers.service';
import { formatMoney } from '@/lib/utils/money';
import { ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { InactiveBadge, TableSkeleton, useLoad } from '../banking/banking-parts';
import { CUSTOMER_STATUS, SALES_TABS } from './sales-documents';
import { STICKY_KEY, StatusPill, useUrlSearch } from './sales-parts';

const COLUMN_COUNT = 5;

function CustomersTable({ data, onOpen }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={STICKY_KEY}>Name</TableHead>
          <TableHead className="text-end">Uninvoiced</TableHead>
          <TableHead className="text-end">Accounts receivable</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-end">Available credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.items.map((customer) => (
          <TableRow key={customer.id} className="cursor-pointer" onClick={() => onOpen(customer.id)}>
            <TableCell data-card="title" className={STICKY_KEY}>
              <span className="flex flex-wrap items-center gap-2">
                <Button variant="link" className="text-foreground hover:text-link" onClick={(event) => { event.stopPropagation(); onOpen(customer.id); }}>
                  {customer.name}
                </Button>
                {customer.is_inactive && <InactiveBadge />}
              </span>
            </TableCell>
            <TableCell className="num" data-label="Uninvoiced">{formatMoney(customer.uninvoiced)}</TableCell>
            <TableCell className="num" data-card="end">{formatMoney(customer.ar_balance)}</TableCell>
            <TableCell data-label="Status"><StatusPill statuses={CUSTOMER_STATUS} status={customer.status} /></TableCell>
            <TableCell className="num" data-label="Available credit">{formatMoney(customer.available_credit)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell>Total</TableCell>
          <TableCell className="max-md:hidden" />
          <TableCell className="num" data-label="Accounts receivable">{formatMoney(data.total_ar_balance)}</TableCell>
          <TableCell colSpan={2} className="max-md:hidden" />
        </TableRow>
      </TableFooter>
    </Table>
  );
}

// ?tab=customers[&q=search][&p=N]: Manager's columns, the receivable total from the server.
export default function CustomersList({ businessId, page, search, active, canCreate }) {
  const navigate = useTabNavigate(SALES_TABS.customers);
  const [query, setQuery] = useUrlSearch(navigate, search, active);
  const { data, error } = useLoad(() => listCustomers(businessId, { page, search }), [businessId, page, search, active]);


  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} titleWidth="w-40" />;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={canCreate && (
          <Button onClick={() => navigate({ new: 1 })}>
            <Plus />
            New Customer
          </Button>
        )}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search customers" />
      </ListToolbar>
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ q: search, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={Users} title={search ? 'No customers match this search' : 'No customers yet'} />
        ) : (
          <CustomersTable data={data} onOpen={(id) => navigate({ view: id })} />
        )}
      </ListCard>
    </div>
  );
}
