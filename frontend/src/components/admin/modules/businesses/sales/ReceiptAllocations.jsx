'use client';

import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListCard } from '@/components/common/page';
import { formatMoney } from '@/lib/utils/money';
import { isZeroAmount } from '../coa/coa-tree';
import { documentHref } from '../banking/banking-parts';
import { DOC_TYPES } from './sales-documents';

function Summary({ label, value }) {
  return (
    <p className="flex justify-between gap-6 px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{formatMoney(value)}</span>
    </p>
  );
}

// A receipt's invoice allocations (server-made: chosen invoice or oldest first), early discounts and any credit left.
export default function ReceiptAllocations({ doc }) {
  const allocations = doc.allocations ?? [];
  const discount = doc.early_discount_total;
  const credit = doc.unallocated_credit;
  const hasDiscount = discount && !isZeroAmount(discount);
  const hasCredit = credit && !isZeroAmount(credit);
  if (allocations.length === 0 && !hasDiscount && !hasCredit) return null;

  return (
    <section aria-labelledby="receipt-allocations" className="mt-10">
      <h2 id="receipt-allocations" className="mb-3 text-md font-semibold">Applied to invoices</h2>
      <ListCard>
        {allocations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sales invoice</TableHead>
                <TableHead className="text-end">Early payment discount</TableHead>
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((allocation) => (
                <TableRow key={allocation.invoice_id}>
                  <TableCell data-card="title">
                    <Link href={documentHref(DOC_TYPES.invoice, allocation.invoice_id)} className="hover:text-link hover:underline">
                      {allocation.invoice_reference || 'Sales invoice'}
                    </Link>
                  </TableCell>
                  <TableCell className="num" data-label="Early payment discount">
                    {allocation.early_discount && !isZeroAmount(allocation.early_discount) ? formatMoney(allocation.early_discount) : ''}
                  </TableCell>
                  <TableCell className="num" data-card="end">{formatMoney(allocation.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasDiscount && <Summary label="Early payment discount" value={discount} />}
        {hasCredit && <Summary label="Unallocated credit (kept for the customer)" value={credit} />}
      </ListCard>
    </section>
  );
}
