'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { inventoryLocationsService } from '@/lib/services/inventory.service';
import CatalogSettingsPage from '../sales/CatalogSettingsPage';
import { CatalogDialog, TextInput, useCatalogSave } from '../sales/catalog-dialog';
import { INVENTORY_AREAS } from './inventory-documents';

const COLUMNS = [
  {
    key: 'name',
    label: 'Name',
    render: (location) => (
      <>
        {location.name}
        {location.is_default && <Badge variant="neutral">Default</Badge>}
      </>
    ),
  },
  { key: 'code', label: 'Code', render: (location) => location.code },
];

function LocationDialog({ businessId, record, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ name: record?.name ?? '', code: record?.code ?? '' }));
  const { saving, error, save } = useCatalogSave({ service: inventoryLocationsService, businessId, record, onSaved });
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const body = () => (form.name.trim()
    ? { body: { name: form.name.trim(), code: form.code.trim() || null } }
    : { error: 'Name is required.' });

  return (
    <CatalogDialog title={record ? 'Edit Inventory Location' : 'New Inventory Location'} saving={saving} error={error} onClose={onClose} onSave={() => save(body())}>
      <TextInput id="location-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} disabled={saving} autoFocus />
      <TextInput id="location-code" label="Code" value={form.code} onChange={(v) => setField('code', v)} disabled={saving} />
    </CatalogDialog>
  );
}

// ?tab=settings&page=inventory-locations: where stock is kept. The default location (used when a document
// names none) is marked and cannot be deleted; a location documents use cannot be deleted either.
export default function InventoryLocationsPage({ business }) {
  return (
    <CatalogSettingsPage
      businessId={business.id}
      title="Inventory Locations"
      noun="Inventory Location"
      area={INVENTORY_AREAS.locations}
      service={inventoryLocationsService}
      columns={COLUMNS}
      inUseCode="location_in_use"
      inUseMessage="This location is used on documents, so it cannot be deleted."
      icon={MapPin}
      canDelete={(location) => !location.is_default}
      renderDialog={(props) => <LocationDialog businessId={business.id} {...props} />}
    />
  );
}
