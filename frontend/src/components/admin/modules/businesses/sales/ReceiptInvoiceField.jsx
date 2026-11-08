'use client';

import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { useLoad } from '../banking/banking-parts';
import { InvoiceSelect } from './sales-parts';

const NO_INVOICES = { items: [] };

/*
  On a receipt's Accounts receivable line (or a payment's Accounts payable line): which of the party's open
  invoices (as at the document date) the line pays, or Automatic (oldest first). `side` is the TRADE_SIDES entry.
  Sales invoices also show the early payment discount still available and the amount that settles them in full.
  value: { id, reference } of the chosen invoice, or null.
*/
export default function ReceiptInvoiceField({ businessId, side, partyId, date, value, onChange, disabled, number }) {
  const { data } = useLoad(
    () => (partyId && date ? side.parties.openInvoices(businessId, partyId, date) : Promise.resolve(NO_INVOICES)),
    [businessId, side.key, partyId, date],
  );
  const invoices = data?.items ?? [];
  // Automatic pays the oldest open invoice first, so its discount is the one that applies.
  const target = value?.id ? invoices.find((invoice) => invoice.invoice_id === value.id) : invoices[0];
  const discount = target?.early_discount;

  return (
    <div className="grid gap-1.5">
      <InvoiceSelect
        id={`receipt-invoice-${number}`}
        label={`${side.invoiceLabel}, line ${number}`}
        invoices={invoices}
        current={value}
        value={value?.id ?? ''}
        onChange={(id) => {
          const invoice = invoices.find((entry) => entry.invoice_id === id);
          onChange(id ? { id, reference: invoice?.reference ?? value?.reference ?? null } : null);
        }}
        disabled={disabled || !partyId}
      />
      {discount && (
        <p className="text-sm text-muted-foreground">
          Discount available until <FormattedDate value={discount.until} />: <Money value={discount.amount} />.
          {' '}Paying <Money value={discount.settle_amount} className="font-medium text-foreground" /> settles {target.reference || 'the invoice'} in full.
        </p>
      )}
    </div>
  );
}
