'use client';

import CashTransactionsTab from '../banking/CashTransactionsTab';

export default function BusinessPayments({ business }) {
  return <CashTransactionsTab business={business} kind="payment" />;
}
