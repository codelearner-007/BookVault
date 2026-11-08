'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTERPARTY, COUNTERPARTY_OPTIONS } from './cash-directions';
import PartyPicker from './PartyPicker';

// Paid by / Payee: a kind (Customer, Supplier, Capital account, Other) then a party record or free text.
// value: { kind, party: { id, name } | null, name }.
export default function CounterpartyField({ businessId, label, value, onChange, disabled }) {
  const option = COUNTERPARTY_OPTIONS.find((o) => o.value === value.kind);
  return (
    <div className="grid gap-2">
      <Label htmlFor="cash-counterparty-kind">{label}</Label>
      <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2 max-sm:grid-cols-1">
        <Select
          value={value.kind}
          onValueChange={(kind) => onChange({ kind, party: null, name: '' })}
          disabled={disabled}
        >
          <SelectTrigger id="cash-counterparty-kind" aria-label={`${label} type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTERPARTY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {option?.party && (
          <PartyPicker
            businessId={businessId}
            kind={value.kind}
            value={value.party}
            onChange={(party) => onChange({ ...value, party })}
            disabled={disabled}
            label={label}
            placeholder={`Select ${option.label.toLowerCase()}`}
          />
        )}
        {value.kind === COUNTERPARTY.other && (
          <Input
            aria-label={`${label} name`}
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
