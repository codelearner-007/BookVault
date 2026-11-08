'use client';

import CashTransactionsTab from '../banking/CashTransactionsTab';

export default function BusinessReceipts({ business }) {
  return <CashTransactionsTab business={business} kind="receipt" />;
}
