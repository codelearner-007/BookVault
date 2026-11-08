'use client';

import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListCard } from '@/components/common/page';
import { formatMoney } from '@/lib/utils/money';
import { isZeroAmount } from '../coa/coa-tree';
import { documentHref } from '../banking/banking-parts';

function Summary({ label, value }) {
  return (
    <p className="flex justify-between gap-6 px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{formatMoney(value)}</span>
    </p>
  );
}

const hasAmount = (value) => !!value && !isZeroAmount(value);

/*
  A receipt's or payment's invoice allocations (server-made: chosen invoice or oldest first), early payment
  discounts (sales only) and any credit left for the party. `side` is the TRADE_SIDES entry of the direction.
*/
export default function ReceiptAllocations({ doc, side }) {
  const allocations = doc.allocations ?? [];
  const discount = doc.early_discount_total;
  const credit = doc.unallocated_credit;
  const showDiscounts = hasAmount(discount) || allocations.some((allocation) => hasAmount(allocation.early_discount));
  if (allocations.length === 0 && !hasAmount(discount) && !hasAmount(credit)) return null;

  return (
    <section aria-labelledby="receipt-allocations" className="mt-10">
      <h2 id="receipt-allocations" className="mb-3 text-md font-semibold">Applied to invoices</h2>
      <ListCard>
        {allocations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{side.invoiceLabel}</TableHead>
                {showDiscounts && <TableHead className="text-end">Early payment discount</TableHead>}
                <TableHead className="text-end">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((allocation) => (
                <TableRow key={allocation.invoice_id}>
                  <TableCell data-card="title">
                    <Link href={documentHref(side.invoiceType, allocation.invoice_id)} className="hover:text-link hover:underline">
                      {allocation.invoice_reference || side.invoiceLabel}
                    </Link>
                  </TableCell>
                  {showDiscounts && (
                    <TableCell className="num" data-label="Early payment discount">
                      {hasAmount(allocation.early_discount) ? formatMoney(allocation.early_discount) : ''}
                    </TableCell>
                  )}
                  <TableCell className="num" data-card="end">{formatMoney(allocation.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasAmount(discount) && <Summary label="Early payment discount" value={discount} />}
        {hasAmount(credit) && <Summary label={`Unallocated credit (kept for the ${side.partyNoun})`} value={credit} />}
      </ListCard>
    </section>
  );
}
