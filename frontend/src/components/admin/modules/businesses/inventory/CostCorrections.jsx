'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { listCostCorrections } from '@/lib/services/inventory.service';
import { formatMoney } from '@/lib/utils/money';
import { BackButton, ErrorAlert, useTabNavigate } from '../ledger/ledger-parts';
import { TableSkeleton, useLoad } from '../banking/banking-parts';
import { INVENTORY_TABS, stockDocumentHref, stockDocumentLabel } from './inventory-documents';

const COLUMN_COUNT = 5;

function DocumentLink({ type, id, reference }) {
  return (
    <Link href={stockDocumentHref(type, id)} className="hover:text-link hover:underline">
      {[stockDocumentLabel(type), reference].filter(Boolean).join(' ')}
    </Link>
  );
}

// ?tab=inventory-items&corrections=1[&p=N]: cost of sales re-posted after a back-dated stock change.
export default function CostCorrections({ businessId, page }) {
  const navigate = useTabNavigate(INVENTORY_TABS.items);
  const { data, error } = useLoad(() => listCostCorrections(businessId, page), [businessId, page]);

  if (!data && !error) return <TableSkeleton columns={COLUMN_COUNT} />;
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Cost Corrections"
        description="Cost of sales re-posted after a stock change dated before them."
        back={<BackButton onClick={() => navigate({})} label="Back to inventory items" />}
      />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <ListCard
        footer={data?.total > 0 && (
          <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={(next) => navigate({ corrections: 1, p: next > 1 ? next : null })} />
        )}
      >
        {items.length === 0 ? (
          <EmptyState icon={History} title="No cost corrections" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Caused by</TableHead>
                <TableHead className="text-end">Old amount</TableHead>
                <TableHead className="text-end">New amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="num whitespace-nowrap" data-label="Date">{row.date}</TableCell>
                  <TableCell data-card="title"><DocumentLink type={row.document_type} id={row.document_id} reference={row.reference} /></TableCell>
                  <TableCell data-label="Caused by">
                    <DocumentLink type={row.caused_by_document_type} id={row.caused_by_document_id} reference={row.caused_by_reference} />
                  </TableCell>
                  <TableCell className="num" data-label="Old amount">{formatMoney(row.old_amount)}</TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(row.new_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>
    </div>
  );
}
