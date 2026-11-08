'use client';

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListCard } from '@/components/common/page';
import { formatMoney } from '@/lib/utils/money';
import { accountLabel } from './ledger-parts';

const SOURCE_LABEL = { document: 'Original', reversal: 'Reversal' };

// "Account — sub-ledger" like Manager: the bank account or party a control-account line belongs to.
function lineLabel(line) {
  const subLedger = line.bank_account_name || line.party_name;
  return subLedger ? `${accountLabel(line)} — ${subLedger}` : accountLabel(line);
}

function amount(value) {
  return Number(value) === 0 ? '' : formatMoney(value);
}

// One posted ledger entry: its date and source, then Account / Debit / Credit and the totals.
function JournalEntryBlock({ entry }) {
  const label = SOURCE_LABEL[entry.source] ?? entry.source;
  return (
    <section aria-label={`${label} ${entry.entry_date}`} className="pt-2">
      <h3 className="flex items-baseline gap-3 px-4 pb-1 text-sm font-semibold">
        <span className="num">{entry.entry_date}</span>
        <span className="font-medium text-muted-foreground">{label}</span>
      </h3>
      <Table cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-8">Account</TableHead>
            <TableHead className="text-end">Debit</TableHead>
            <TableHead className="text-end">Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.line_no}>
              <TableCell className="ps-8">{lineLabel(line)}</TableCell>
              <TableCell className="num w-32">{amount(line.debit)}</TableCell>
              <TableCell className="num w-32">{amount(line.credit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell><span className="sr-only">Total</span></TableCell>
            <TableCell className="num">{formatMoney(entry.total_debit)}</TableCell>
            <TableCell className="num">{formatMoney(entry.total_credit)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

// The "Transaction Journal" of a document (GET .../documents/{id}/journal): what actually hit the ledger.
export default function TransactionJournal({ journal }) {
  const entries = journal?.entries ?? [];
  return (
    <section aria-labelledby="transaction-journal" className="mt-10">
      <h2 id="transaction-journal" className="mb-3 text-md font-semibold">Transaction Journal</h2>
      <ListCard>
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing posted to the ledger yet. Drafts are not posted.</p>
        ) : (
          entries.map((entry) => <JournalEntryBlock key={entry.id} entry={entry} />)
        )}
      </ListCard>
    </section>
  );
}
