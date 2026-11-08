'use client';

import { listOpenInvoices } from '@/lib/services/customers.service';
import { formatMoney } from '@/lib/utils/money';
import { useLoad } from '../banking/banking-parts';
import { InvoiceSelect } from './sales-parts';

const NO_INVOICES = { items: [] };

/*
  On a receipt's Accounts receivable line: which of the customer's open invoices (as at the receipt date) the
  line pays, or Automatic (oldest first). Shows the early payment discount still available on that invoice
  and the amount that settles it in full. value: { id, reference } of the chosen invoice, or null.
*/
export default function ReceiptInvoiceField({ businessId, customerId, date, value, onChange, disabled, number }) {
  const { data } = useLoad(
    () => (customerId && date ? listOpenInvoices(businessId, customerId, date) : Promise.resolve(NO_INVOICES)),
    [businessId, customerId, date],
  );
  const invoices = data?.items ?? [];
  // Automatic pays the oldest open invoice first, so its discount is the one that applies.
  const target = value?.id ? invoices.find((invoice) => invoice.invoice_id === value.id) : invoices[0];
  const discount = target?.early_discount;

  return (
    <div className="grid gap-1.5">
      <InvoiceSelect
        id={`receipt-invoice-${number}`}
        label={`Sales invoice, line ${number}`}
        invoices={invoices}
        current={value}
        value={value?.id ?? ''}
        onChange={(id) => {
          const invoice = invoices.find((entry) => entry.invoice_id === id);
          onChange(id ? { id, reference: invoice?.reference ?? value?.reference ?? null } : null);
        }}
        disabled={disabled || !customerId}
      />
      {discount && (
        <p className="text-sm text-muted-foreground">
          Discount available until {discount.until}: <span className="num">{formatMoney(discount.amount)}</span>.
          {' '}Paying <span className="num font-medium text-foreground">{formatMoney(discount.settle_amount)}</span> settles {target.reference || 'the invoice'} in full.
        </p>
      )}
    </div>
  );
}
