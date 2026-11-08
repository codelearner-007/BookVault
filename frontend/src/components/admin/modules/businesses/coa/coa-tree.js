/* Chart of accounts helpers shared by the tree, its dialogs and the Starting balances page. */

export const STATEMENTS = { balanceSheet: 'balance_sheet', pl: 'pl' };
export const STATEMENT_TITLES = {
  [STATEMENTS.balanceSheet]: 'Balance Sheet',
  [STATEMENTS.pl]: 'Profit and Loss Statement',
};

// Account type follows the root group it sits under.
export const ROOT_ACCOUNT_TYPE = {
  assets: 'asset',
  liabilities: 'liability',
  equity: 'equity',
  income: 'income',
  expenses: 'expense',
};
export const ACCOUNT_TYPE_LABELS = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
};

export const CASH_FLOW_OPTIONS = [
  { value: 'operating', label: 'Operating' },
  { value: 'investing', label: 'Investing' },
  { value: 'financing', label: 'Financing' },
  { value: 'cash_equivalent', label: 'Cash equivalent' },
];

export const SIDES = { debit: 'debit', credit: 'credit' };
export const SIDE_SHORT = { debit: 'Dr', credit: 'Cr' };
// The side a root's balances normally sit on (a sensible default for a new starting balance).
const CREDIT_ROOTS = new Set(['liabilities', 'equity', 'income']);
export function normalSide(rootKey) {
  return CREDIT_ROOTS.has(rootKey) ? SIDES.credit : SIDES.debit;
}

// A money amount as typed: digits with up to 4 decimals (the stored scale).
export const MONEY_INPUT = /^\d+(\.\d{1,4})?$/;

export const ACCOUNT_IN_USE = 'account_in_use';

// Display check only (zero amounts are muted or hidden); never used for arithmetic.
export function isZeroAmount(value) {
  return Number(value) === 0;
}

// An API amount ("400.0000") as an input value ("400.00"); zero becomes blank. String work only.
export function toInputAmount(value) {
  if (value === null || value === undefined || isZeroAmount(value)) return '';
  return String(value).replace(/(\.\d\d)0+$/, '$1');
}

// Every account of the tree in chart order with its head group (the name of the root it sits under: Assets,
// Liabilities, Equity, Income, Expenses), for the account pickers. keep(account, root) filters.
export function accountsFromTree(tree, keep = () => true) {
  const accounts = [];
  tree.roots.forEach((root) => {
    const walk = (group) => {
      group.accounts.forEach((account) => {
        if (keep(account, root)) accounts.push({ ...account, headGroup: root.name });
      });
      group.groups.forEach(walk);
    };
    walk(root);
  });
  return accounts;
}

// The head group of the account with this system code (the bank control account for bank and cash pickers).
export function headGroupOf(tree, systemAccountCode) {
  return accountsFromTree(tree, (account) => account.system_account_code === systemAccountCode)[0]?.headGroup ?? null;
}

// Groups depth-first as { group, depth, rootKey }, for the group selects.
export function flattenGroups(roots) {
  const entries = [];
  const walk = (group, depth, rootKey) => {
    entries.push({ group, depth, rootKey });
    group.groups.forEach((child) => walk(child, depth + 1, rootKey));
  };
  roots.forEach((root) => walk(root, 0, root.root_key));
  return entries;
}

// The group and every group under it.
export function subtreeIds(group) {
  const ids = new Set([group.id]);
  const walk = (node) => node.groups.forEach((child) => { ids.add(child.id); walk(child); });
  walk(group);
  return ids;
}
