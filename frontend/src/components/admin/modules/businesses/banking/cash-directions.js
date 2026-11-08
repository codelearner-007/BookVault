import { PARTY_KINDS } from '@/lib/services/parties.service';
import { paymentsService } from '@/lib/services/payments.service';
import { receiptsService } from '@/lib/services/receipts.service';
import { TRADE_SIDES } from '../sales/sales-documents';
import { accountsFromTree } from '../coa/coa-tree';
import { BANKING_TABS } from './banking-parts';

// Control accounts whose lines need a sub-ledger party (system_account_code -> party kind).
const CAPITAL_PARTY = { capital_control: PARTY_KINDS.capitalAccount };
// Receipts also take Accounts receivable lines (a customer), payments Accounts payable lines (a supplier);
// either may name the invoice the line pays. `side` is the trade side whose invoices the lines settle.
const RECEIPT_PARTIES = { ...CAPITAL_PARTY, accounts_receivable: PARTY_KINDS.customer };
const PAYMENT_PARTIES = { ...CAPITAL_PARTY, accounts_payable: PARTY_KINDS.supplier };

// Receipts and payments are one set of components; a direction names the words and the service.
export const CASH_DIRECTIONS = {
  receipt: {
    tab: BANKING_TABS.receipts,
    service: receiptsService,
    title: 'Receipt',
    plural: 'Receipts',
    noun: 'receipt',
    bankLabel: 'Received in',
    counterpartyLabel: 'Paid by',
    tone: 'in',
    partyAccounts: RECEIPT_PARTIES,
    side: TRADE_SIDES.sales,
  },
  payment: {
    tab: BANKING_TABS.payments,
    service: paymentsService,
    title: 'Payment',
    plural: 'Payments',
    noun: 'payment',
    bankLabel: 'Paid from',
    counterpartyLabel: 'Payee',
    tone: 'out',
    partyAccounts: PAYMENT_PARTIES,
    side: TRADE_SIDES.purchases,
  },
};

// Counterparty kinds of the form; `party` kinds pick a record from GET /parties, Other is free text.
export const COUNTERPARTY = { none: 'none', other: 'other' };
export const COUNTERPARTY_OPTIONS = [
  { value: COUNTERPARTY.none, label: 'None' },
  { value: PARTY_KINDS.customer, label: 'Customer', party: true },
  { value: PARTY_KINDS.supplier, label: 'Supplier', party: true },
  { value: PARTY_KINDS.capitalAccount, label: 'Capital account', party: true },
  { value: COUNTERPARTY.other, label: 'Other' },
];

export const PARTY_LABELS = {
  [PARTY_KINDS.capitalAccount]: 'capital account', [PARTY_KINDS.customer]: 'customer', [PARTY_KINDS.supplier]: 'supplier',
};
// Lines never post to the bank control account directly: the bank account is the document's other side.
export const BANK_CONTROL_ACCOUNT = 'cash_control';

// Accounts a line may use, from the COA tree: active, not the bank control; plus any a saved line already uses.
export function lineAccountsFromTree(tree, savedLines = []) {
  const accounts = accountsFromTree(tree, (account) => account.is_active && account.system_account_code !== BANK_CONTROL_ACCOUNT);
  const known = new Set(accounts.map((account) => account.id));
  for (const line of savedLines) {
    if (known.has(line.account_id)) continue;
    known.add(line.account_id);
    accounts.push({ id: line.account_id, name: line.account_name, system_account_code: null, headGroup: null });
  }
  return accounts;
}

// Paid by / Payee names a customer (supplier): lines without an account, or on that control account for
// another party, default to Accounts receivable (payable) for it with no invoice, so money received
// without an invoice still moves the party's balance (a credit the next invoice absorbs).
// Lines the user put on another account are left alone.
export function linesForCounterparty(lines, accounts, partyAccounts, counterparty) {
  const code = Object.keys(partyAccounts).find((key) => key !== 'capital_control' && partyAccounts[key] === counterparty.kind);
  const control = code && accounts.find((account) => account.system_account_code === code);
  if (!control || !counterparty.party) return lines;
  return lines.map((line) => {
    const onControl = line.account_id === control.id;
    if (line.account_id && !(onControl && line.party?.id !== counterparty.party.id)) return line;
    return { ...line, account_id: control.id, party: counterparty.party, invoice: null };
  });
}

// Friendly text for the 422 codes of a cash transaction; other errors show the API message.
export const CASH_ERRORS = {
  account_required: 'Choose an account on every line.',
  bank_account_required: 'Choose the bank or cash account.',
  party_required: 'Choose a capital account, customer or supplier on every line whose account needs one.',
  party_not_allowed: 'Only lines on Capital accounts, Accounts receivable or Accounts payable take a party.',
  account_not_supported: 'One of the line accounts cannot be used here.',
  cleared_not_allowed: 'This bank account cannot have pending transactions.',
  total_not_positive: 'The total must be more than zero.',
};
