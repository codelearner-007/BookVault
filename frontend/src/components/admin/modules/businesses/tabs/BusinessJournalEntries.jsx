'use client';

import { useSearchParams } from 'next/navigation';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { RIGHT_CREATE, RIGHT_DELETE, RIGHT_EDIT } from '@/lib/constants/access-rights';
import { can } from '@/lib/navigation/access';
import JournalEntriesList from '../ledger/JournalEntriesList';
import JournalEntryForm from '../ledger/JournalEntryForm';
import JournalEntryView from '../ledger/JournalEntryView';
import { JE_AREA, JE_TAB, usePageParam } from '../ledger/ledger-parts';

// ?tab=journal-entries                list (&p=N for the page)
//                     &new=1          new entry
//                     &edit=<id>      edit an entry
//                     &view=<id>      view an entry and its Transaction Journal
// The server enforces every right; these only hide what the user cannot do.
export default function BusinessJournalEntries({ business }) {
  const searchParams = useSearchParams();
  const { access } = useBusinessWorkspace();
  const page = usePageParam();
  // Hidden (another tab is open): keep showing the list, never react to another tab's params.
  const active = searchParams.get('tab') === JE_TAB;
  const param = (key) => (active ? searchParams.get(key) : null);
  const rights = {
    create: can(access, JE_AREA, RIGHT_CREATE),
    edit: can(access, JE_AREA, RIGHT_EDIT),
    delete: can(access, JE_AREA, RIGHT_DELETE),
  };

  const editId = param('edit');
  const viewId = param('view');
  if (param('new')) return <JournalEntryForm businessId={business.id} allowed={rights.create} />;
  if (editId) return <JournalEntryForm key={editId} businessId={business.id} entryId={editId} allowed={rights.edit} />;
  if (viewId) return <JournalEntryView key={viewId} businessId={business.id} entryId={viewId} rights={rights} />;
  return <JournalEntriesList businessId={business.id} page={active ? page : 1} active={active} canCreate={rights.create} canEdit={rights.edit} />;
}
