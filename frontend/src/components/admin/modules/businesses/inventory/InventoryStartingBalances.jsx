'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ListCard } from '@/components/common/page';
import { ListPagination } from '@/components/super-admin/platform-parts';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import {
  inventoryLocationsService, listInventoryStartingBalances, setInventoryStartingBalance,
} from '@/lib/services/inventory.service';
import { sumMoney } from '@/lib/utils/money';
import { Quantity } from '@/components/common/business-format';
import { Money } from '@/components/common/money';
import { MONEY_INPUT, isZeroAmount, toInputAmount } from '../coa/coa-tree';
import { ErrorAlert } from '../ledger/ledger-parts';
import { useLoad } from '../banking/banking-parts';
import { CatalogDialog, TextInput } from '../sales/catalog-dialog';
import { plainNumber } from '../sales/sales-documents';
import { recordLabel } from './inventory-documents';

const AREA = 'settings.starting_balances';
const SKELETON_ROWS = 2;
const itemName = (item) => recordLabel({ code: item.item_code, name: item.item_name });

function onHandAt(item, locationId) {
  return plainNumber(item.locations.find((location) => location.location_id === locationId)?.qty_on_hand);
}

// Display-only preview of what the server will value each unit at; the stored cost is computed server-side.
function averageCostPreview(qtys, totalCost) {
  const qty = Number(sumMoney(qtys));
  return qty > 0 && MONEY_INPUT.test(totalCost) ? <Money value={Number(totalCost) / qty} /> : '—';
}

function validate(rows, totalCost) {
  if (rows.some((row) => !MONEY_INPUT.test(row.qty))) return 'Quantities must be numbers, for example 10.';
  if (!MONEY_INPUT.test(totalCost)) return 'The total cost must be a number, for example 250.00.';
  if (rows.length === 0 && !isZeroAmount(totalCost)) return 'A total cost needs a qty at some location.';
  return null;
}

// Qty on hand per location and the total cost of one item; clearing every qty removes its starting balance.
function StartingBalanceDialog({ businessId, item, locations, onClose, onSaved }) {
  const [qtys, setQtys] = useState(() => Object.fromEntries(locations.map((location) => [location.id, onHandAt(item, location.id)])));
  const [totalCost, setTotalCost] = useState(toInputAmount(item.total_cost));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const rows = locations
    .map((location) => ({ location_id: location.id, qty: qtys[location.id].trim() }))
    .filter((row) => row.qty !== '' && !isZeroAmount(row.qty));
  const cost = totalCost.trim() || '0';

  async function save() {
    const invalid = validate(rows, cost);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError(null);
    try {
      await setInventoryStartingBalance(businessId, item.item_id, { total_cost: cost, locations: rows });
      onSaved();
    } catch (err) {
      setError(err?.message ?? 'Failed to save the starting balance.');
      setSaving(false);
    }
  }

  return (
    <CatalogDialog title={`Starting balance — ${itemName(item)}`} saving={saving} error={error} onClose={onClose} onSave={save}>
      <p className="text-sm text-muted-foreground">Qty on hand at each location when the books start. Clear every qty to remove it.</p>
      <ul className="grid gap-3" aria-label="Qty on hand by location">
        {locations.map((location) => (
          <li key={location.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">{location.name}</span>
            <Input
              aria-label={`Qty, ${location.name}`} inputMode="decimal" placeholder="0" className="num w-32" value={qtys[location.id]}
              onChange={(e) => setQtys((prev) => ({ ...prev, [location.id]: e.target.value }))} disabled={saving}
            />
          </li>
        ))}
      </ul>
      <TextInput id="inventory-sb-total-cost" label="Total cost" inputMode="decimal" placeholder="0.00" className="num w-40" value={totalCost} onChange={setTotalCost} disabled={saving} />
      <p className="text-sm text-muted-foreground">
        Average cost: <span className="num font-semibold text-foreground">{averageCostPreview(rows.map((row) => row.qty), cost)}</span>
      </p>
    </CatalogDialog>
  );
}

function ItemRow({ item, canEdit, onEdit }) {
  const name = itemName(item);
  const where = item.locations.map((location) => `${location.location_name} ${plainNumber(location.qty_on_hand)}`).join(' · ');
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-row-divider px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words font-medium">{name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{where || 'No starting balance'}</p>
      </div>
      <span className="text-sm text-muted-foreground">Qty <Quantity value={item.qty} className="text-foreground" /></span>
      <span className="text-sm text-muted-foreground">Total cost <Money value={item.total_cost} className="text-foreground" /></span>
      {canEdit && <Button size="sm" variant="secondary" onClick={() => onEdit(item)} aria-label={`Edit starting balance, ${name}`}>Edit</Button>}
    </li>
  );
}

/*
  Starting balances > Inventory items: what was on hand at each location and its total cost when the books
  start (Dr Inventory on hand / Cr Retained earnings, posted by the server). Paged here, not in the URL.
*/
export default function InventoryStartingBalances({ businessId }) {
  const { access } = useBusinessWorkspace();
  const canEdit = can(access, AREA, RIGHT_EDIT);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const { data, error, reload } = useLoad(() => listInventoryStartingBalances(businessId, page), [businessId, page]);
  const locations = useLoad(() => (canEdit ? inventoryLocationsService.listAll(businessId) : Promise.resolve(null)), [businessId, canEdit]);
  const items = data?.items ?? [];

  return (
    <section aria-label="Inventory items" className="max-w-3xl">
      <h2 className="mb-3 text-md font-semibold">Inventory items</h2>
      {editing && locations.data && (
        <StartingBalanceDialog
          businessId={businessId} item={editing} locations={locations.data.items} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {(error || locations.error) && <ErrorAlert>{error ?? locations.error}</ErrorAlert>}
      <ListCard footer={data?.total > 0 && <ListPagination page={page} totalPages={Math.max(1, data.total_pages)} total={data.total} onPage={setPage} />}>
        {!data && !error && (
          <div aria-busy="true" className="space-y-1 p-2">
            {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row rounded-control" />)}
          </div>
        )}
        {data && items.length === 0 && <EmptyState icon={Boxes} title="No inventory items yet" />}
        {items.length > 0 && (
          <ul aria-label="Starting balances of inventory items">
            {items.map((item) => (
              <ItemRow key={item.item_id} item={item} canEdit={canEdit && !!locations.data} onEdit={setEditing} />
            ))}
          </ul>
        )}
      </ListCard>
    </section>
  );
}
