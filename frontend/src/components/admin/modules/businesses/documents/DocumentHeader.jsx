'use client';

import { Card } from '@/components/ui/card';
import { LogoWordmark } from '@/components/common/logo';
import { Money } from '@/components/common/money';
import { sideOfPartyKind } from '../sales/sales-documents';
import { useLoad } from '../banking/banking-parts';

/*
  The head of every printable document: the document meta (number, dates, status) on the left and the
  customer / supplier block on the right, split by a divider (stacked on mobile); all left-aligned; Print / PDF add the title and business above them.
*/

// The full customer / supplier record behind a document (email, code, address); null without one or without access.
export function usePartyRecord(businessId, kind, partyId) {
  const side = sideOfPartyKind(kind);
  const { data } = useLoad(
    () => (side && partyId ? side.parties.get(businessId, partyId).catch(() => null) : Promise.resolve(null)),
    [businessId, kind, partyId],
  );
  return data;
}

function BusinessBlock({ business }) {
  return (
    <div className="text-sm">
      <p className="font-semibold text-foreground">{business.name}</p>
      {business.address && <p className="mt-1 whitespace-pre-line text-muted-foreground">{business.address}</p>}
      {business.country && <p className="text-muted-foreground">{business.country}</p>}
    </div>
  );
}

/*
  party: { label, name, address?, record? } where record is the customer / supplier (email, code,
  billing_address). The document's own address wins over the record's (it can be edited per document).
*/
export function PartyBlock({ party }) {
  if (!party?.name) return null;
  const { record } = party;
  const address = party.address ?? record?.billing_address;
  return (
    <div className="min-w-0 text-sm">
      <p className="text-muted-foreground">{party.label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{party.name}</p>
      {address && <p className="mt-1 whitespace-pre-line text-muted-foreground">{address}</p>}
      {record?.email && <p className="mt-1 text-muted-foreground">{record.email}</p>}
      {record?.code && <p className="text-muted-foreground">Code {record.code}</p>}
    </div>
  );
}

// meta: [label, value] pairs; empty values are skipped.
export function MetaList({ meta }) {
  const rows = meta.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== false);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_auto] content-start justify-start gap-x-6 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/*
  On screen the page title already names the document, so the title + business row is print-only (Print / PDF);
  the card starts with the party and the meta. The status sits with the meta on both.
*/
export default function DocumentHeader({ title, status, business, party, meta = [] }) {
  const number = meta[0]?.[1];
  const statusRow = status ? [['Status', <span key="s" className="inline-flex flex-wrap gap-1.5">{status}</span>]] : [];
  return (
    <header className="space-y-8">
      <div className="hidden items-start justify-between gap-8 border-b-2 border-accent-contrast pb-5" data-print-only="">
        <div className="space-y-3">
          <LogoWordmark className="h-6 w-auto" />
          {business && <BusinessBlock business={business} />}
        </div>
        <div className="text-end">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
          {number && <p className="mt-1 text-sm font-medium tabular-nums text-muted-foreground">{number}</p>}
        </div>
      </div>
      <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="pb-6 sm:pe-8 sm:pb-0"><MetaList meta={[...meta, ...statusRow]} /></div>
        {party?.name && <div className="pt-6 sm:ps-8 sm:pt-0"><PartyBlock party={party} /></div>}
      </div>
      {business && (
        <p className="hidden" data-print-footer="">
          {[business.name, business.address?.replace(/\s*\n\s*/g, ', '), business.country].filter(Boolean).join(' · ')}
        </p>
      )}
    </header>
  );
}

// The document card: what Print and PDF render (data-document-paper).
export function DocumentPaper({ children }) {
  return <Card className="p-card space-y-8" data-document-paper="">{children}</Card>;
}

// The single total of a one-amount document (withholding tax receipt, late fee), right-aligned like a totals row.
export function AmountTotal({ label, value }) {
  return (
    <dl className="ms-auto flex w-full items-baseline justify-between gap-6 border-t border-border pt-4 sm:w-72">
      <dt className="font-semibold">{label}</dt>
      <dd className="num text-lg font-semibold"><Money value={value} /></dd>
    </dl>
  );
}

// The document's description, labelled (a lone line under the header reads like a heading).
export function DocumentDescription({ text }) {
  if (!text) return null;
  return (
    <div className="text-sm">
      <p className="text-muted-foreground">Description</p>
      <p className="mt-1 max-w-prose whitespace-pre-wrap text-foreground">{text}</p>
    </div>
  );
}
