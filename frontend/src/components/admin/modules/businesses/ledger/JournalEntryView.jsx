'use client';

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getJournalEntry, postJournalEntry, voidJournalEntry } from '@/lib/services/journal-entries.service';
import { FormattedDate } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { DocumentSkeleton, useLoad } from '../banking/banking-parts';
import DocumentViewFrame from '../banking/DocumentViewFrame';
import DocumentHeader, { DocumentDescription, DocumentPaper } from '../documents/DocumentHeader';
import { ErrorAlert, JE_STATUS, JE_TAB, StatusBadge, accountLabel, useTabNavigate } from './ledger-parts';

const TITLE = 'Journal Entry';

function EntryDocument({ entry, business }) {
  return (
    <DocumentPaper>
      <DocumentHeader
        title={TITLE}
        status={entry.status !== JE_STATUS.posted && <StatusBadge status={entry.status} />}
        business={business}
        meta={[['Reference', entry.reference], ['Date', <FormattedDate key="d" value={entry.date} />]]}
      />
      <DocumentDescription text={entry.description} />
      <Table cards={false}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-end">Debit</TableHead>
            <TableHead className="text-end">Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entry.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{accountLabel(line)}</TableCell>
              <TableCell className="text-muted-foreground">{line.description}</TableCell>
              <TableCell className="num w-32"><Money value={line.debit} zero="blank" /></TableCell>
              <TableCell className="num w-32"><Money value={line.credit} zero="blank" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2}><span className="sr-only">Total</span></TableCell>
            <TableCell className="num"><Money value={entry.total_debit} /></TableCell>
            <TableCell className="num"><Money value={entry.total_credit} /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </DocumentPaper>
  );
}

// ?tab=journal-entries&view=<id>: the entry, Edit / Clone / Print / PDF / Post / Void.
export default function JournalEntryView({ business, entryId, rights }) {
  const navigate = useTabNavigate(JE_TAB);
  const { data: entry, error, reload } = useLoad(() => getJournalEntry(business.id, entryId), [business.id, entryId]);

  if (!entry) return error ? <ErrorAlert>{error}</ErrorAlert> : <DocumentSkeleton />;

  return (
    <DocumentViewFrame
      businessId={business.id}
      title={entry.reference ? `${TITLE} ${entry.reference}` : TITLE}
      doc={entry}
      rights={rights}
      noun="journal entry"
      onBack={() => navigate({})}
      onEdit={() => navigate({ edit: entry.id })}
      onClone={() => navigate({ new: 1, clone: entry.id })}
      postCall={(version, key) => postJournalEntry(business.id, entry.id, version, key)}
      voidCall={(version, key) => voidJournalEntry(business.id, entry.id, version, key)}
      onChanged={reload}
    >
      <EntryDocument entry={entry} business={business} />
    </DocumentViewFrame>
  );
}
