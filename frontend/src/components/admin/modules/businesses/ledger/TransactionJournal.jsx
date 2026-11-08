'use client';

import { useId } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormattedDate } from '@/components/common/business-format';
import { ListCard } from '@/components/common/page';
import { Money } from '@/components/common/money';
import { getDocumentJournal } from '@/lib/services/journal-entries.service';
import { JOURNAL_COPY as COPY } from '@/lib/copy/money';
import { useLoad } from '../banking/banking-parts';
import { ErrorAlert, accountLabel } from './ledger-parts';

// ?journal=1 keeps the disclosure open across reloads and shared links.
const JOURNAL_PARAM = 'journal';
const SOURCE_LABEL = { document: COPY.original, reversal: COPY.reversal };
const SKELETON_ROWS = 2;

// "Account — sub-ledger" like Manager: the bank account or party a control-account line belongs to.
function lineLabel(line) {
  const subLedger = line.bank_account_name || line.party_name;
  return subLedger ? `${accountLabel(line)} — ${subLedger}` : accountLabel(line);
}

// One posted ledger entry: its date and source, then Account / Debit / Credit and the totals.
function JournalEntryBlock({ entry }) {
  const label = SOURCE_LABEL[entry.source] ?? entry.source;
  return (
    <section aria-label={`${label} ${entry.entry_date}`} className="pt-2">
      <h3 className="flex items-baseline gap-3 px-4 pb-1 text-sm font-semibold">
        <FormattedDate value={entry.entry_date} className="tabular-nums" />
        <span className="font-medium text-muted-foreground">{label}</span>
      </h3>
      <Table cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-8">{COPY.account}</TableHead>
            <TableHead className="text-end">{COPY.debit}</TableHead>
            <TableHead className="text-end">{COPY.credit}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.line_no}>
              <TableCell className="ps-8">{lineLabel(line)}</TableCell>
              <TableCell className="num w-32"><Money value={line.debit} zero="blank" /></TableCell>
              <TableCell className="num w-32"><Money value={line.credit} zero="blank" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell><span className="sr-only">{COPY.total}</span></TableCell>
            <TableCell className="num"><Money value={entry.total_debit} /></TableCell>
            <TableCell className="num"><Money value={entry.total_credit} /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

function JournalBody({ businessId, documentId, version }) {
  const { data, error } = useLoad(() => getDocumentJournal(businessId, documentId), [businessId, documentId, version]);
  if (error) return <ErrorAlert>{error}</ErrorAlert>;
  if (!data) {
    return (
      <ListCard>
        <div className="space-y-2 p-2" aria-busy="true" aria-label={COPY.loading}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full rounded-control" />)}
        </div>
      </ListCard>
    );
  }
  const entries = data.entries ?? [];
  return (
    <ListCard>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        entries.map((entry) => <JournalEntryBlock key={entry.id} entry={entry} />)
      )}
    </ListCard>
  );
}

/*
  The "Transaction journal" of a document (GET .../documents/{id}/journal): what actually hit the ledger.
  Collapsed by default behind a disclosure; it loads only when opened. `version` reloads it after Post / Void.
*/
export default function TransactionJournal({ businessId, documentId, version }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get(JOURNAL_PARAM) === '1';
  const panelId = useId();

  function toggle() {
    const next = new URLSearchParams(searchParams.toString());
    if (open) next.delete(JOURNAL_PARAM);
    else next.set(JOURNAL_PARAM, '1');
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  return (
    <section aria-label={COPY.title} className="mt-8">
      <Button
        variant="ghost"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="-ms-3 px-3 text-md text-foreground"
      >
        {COPY.title}
        <ChevronDown aria-hidden="true" className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </Button>
      <div id={panelId} hidden={!open} className="mt-3">
        {open && <JournalBody businessId={businessId} documentId={documentId} version={version} />}
      </div>
    </section>
  );
}
