'use client';

import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Money } from '@/components/common/money';
import { isZeroAmount } from '../coa/coa-tree';

/*
  One statement of the Summary (Balance Sheet or Profit and Loss) as a borderless table.
  Every figure comes from the server; the client only hides rows (Exclude zero, Collapse groups).
  options: { showCodes, excludeZero, collapse, accountHref(accountId) }
*/

const ROW = 'hover:bg-transparent';
const CELL = 'h-auto py-2';
const TOTAL_ROW = 'hover:bg-transparent font-semibold [&>td]:border-t [&>td]:border-border';

function hasNonZero(group) {
  return !isZeroAmount(group.total)
    || group.accounts.some((account) => !isZeroAmount(account.amount))
    || group.groups.some(hasNonZero);
}

function NameCell({ depth, className, children }) {
  return (
    <TableCell
      style={{ '--depth': depth }}
      className={cn(CELL, 'whitespace-normal break-words ps-[calc(0.5rem+var(--depth)*1.25rem)] max-md:ps-[calc(0.25rem+var(--depth)*0.75rem)]', className)}
    >
      {children}
    </TableCell>
  );
}

function Figure({ value, className }) {
  return <TableCell className={cn(CELL, 'num w-px pe-2', className)}><Money value={value} zero="muted" /></TableCell>;
}

function AccountRow({ account, depth, options }) {
  return (
    <TableRow className={ROW}>
      <NameCell depth={depth}>
        {options.showCodes && account.code && <span className="me-2 tabular-nums text-muted-foreground">{account.code}</span>}
        {account.name}
      </NameCell>
      <TableCell className={cn(CELL, 'num w-px pe-2')}>
        <Link
          href={options.accountHref(account.id)}
          title={`${account.name}: transactions`}
          className={cn(
            'amount-link',
            isZeroAmount(account.amount) && 'text-muted-foreground',
          )}
        >
          <Money value={account.amount} />
        </Link>
      </TableCell>
    </TableRow>
  );
}

// Accounts then sub-groups, one level deeper than their parent; collapsed groups show their total only.
function ChildRows({ node, depth, options }) {
  const accounts = options.excludeZero ? node.accounts.filter((a) => !isZeroAmount(a.amount)) : node.accounts;
  const groups = options.excludeZero ? node.groups.filter(hasNonZero) : node.groups;
  return (
    <>
      {accounts.map((account) => <AccountRow key={account.id} account={account} depth={depth} options={options} />)}
      {groups.map((group) => (
        <GroupRows key={group.id} group={group} depth={depth} options={options} />
      ))}
    </>
  );
}

function GroupRows({ group, depth, options }) {
  return (
    <>
      <TableRow className={ROW}>
        <NameCell depth={depth} className="font-medium">{group.name}</NameCell>
        <Figure value={group.total} className="font-medium" />
      </TableRow>
      {!options.collapse && <ChildRows node={group} depth={depth + 1} options={options} />}
    </>
  );
}

export function SectionRows({ section, label, options }) {
  return (
    <>
      <TableRow className={ROW}>
        <NameCell depth={0} className="pt-5 font-semibold">{label ?? section.name}</NameCell>
        <Figure value={section.total} className="pt-5 font-semibold" />
      </TableRow>
      <ChildRows node={section} depth={1} options={options} />
    </>
  );
}

export function TotalRow({ label, value }) {
  return (
    <TableRow className={TOTAL_ROW}>
      <NameCell depth={0}>{label}</NameCell>
      <Figure value={value} />
    </TableRow>
  );
}

export function StatementTable({ title, children }) {
  return (
    <Table cards={false} aria-label={title}>
      <TableHeader className="sr-only">
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child>td]:border-b-0">{children}</TableBody>
    </Table>
  );
}
