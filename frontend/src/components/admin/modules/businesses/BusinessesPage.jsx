'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, ChevronLeft, ChevronRight, Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ListCard, ListToolbar, MoreMenu, PageHeader, SearchInput } from '@/components/common/page';
import { useShell } from '@/components/shell/ShellContext';
import { BusinessList, BusinessListSkeleton } from '@/components/admin/workspace/BusinessList';
import { useWorkspaceDashboard } from '@/components/admin/workspace/use-workspace-dashboard';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';
import CreateBusinessDialog from './CreateBusinessDialog';
import { useBusinessTrash } from './BusinessTrash';

const CREATE_PARAM = 'create';
const SEARCH_PARAM = 'q';
const PAGE_PARAM = 'p';
const PAGE_SIZE = 24;
const SEARCH_FROM = 6; // search shows once there are more businesses than this
const SEARCH_DEBOUNCE_MS = 250;

// ?q=<search>&p=<page>&create=1 (deep-linkable, restored after reload).
function useListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get(PAGE_PARAM)) || 1);

  function update(changes) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, String(value)) : next.delete(key)));
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return { page, search: searchParams.get(SEARCH_PARAM) ?? '', creating: searchParams.get(CREATE_PARAM) === '1', update };
}

function SearchBox({ value, onSearch }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (draft.trim() === value) return undefined;
    const timer = setTimeout(() => onSearch(draft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value, onSearch]);
  return <SearchInput value={draft} onChange={setDraft} placeholder={COPY.searchPlaceholder} />;
}

function Pager({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Button variant="ghost" size="icon" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={COPY.previousPage}>
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <span>{COPY.pageOf(page, totalPages)}</span>
      <Button variant="ghost" size="icon" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label={COPY.nextPage}>
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </nav>
  );
}

function BusinessRows({ data, search, canCreate, onCreate }) {
  if (data.items.length > 0) return <BusinessList businesses={data.items} />;
  if (search) {
    return <ListCard><EmptyState icon={SearchX} title={COPY.noSearchResults(search)} /></ListCard>;
  }
  return (
    <ListCard>
      <EmptyState
        icon={Building2}
        title={canCreate ? COPY.emptyOwnerTitle : COPY.emptyMemberTitle}
        description={canCreate ? COPY.emptyOwnerDescription : COPY.emptyMemberDescription}
        action={canCreate && <Button onClick={onCreate} className="mt-2"><Plus />{COPY.createBusiness}</Button>}
      />
    </ListCard>
  );
}

export default function BusinessesPage() {
  const { canCreateBusiness } = useShell();
  const { page, search, creating, update } = useListParams();
  const [addOpen, setAddOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { data, error, reload } = useWorkspaceDashboard({ page, pageSize: PAGE_SIZE, search });
  const trash = useBusinessTrash({ onChanged: reload, onError: setActionError });

  const total = data?.total ?? 0;
  const hasBusinesses = total > 0 || Boolean(search);
  const message = actionError ?? error;

  // The business switcher opens the dialog with ?create=1; closing it drops the param.
  function handleAddOpenChange(open) {
    setAddOpen(open);
    if (!open && creating) update({ [CREATE_PARAM]: null });
  }

  function handleCreated() {
    handleAddOpenChange(false);
    reload();
  }

  return (
    <div>
      <PageHeader
        title={COPY.businessesTitle}
        description={data && hasBusinesses ? COPY.businessCount(total) : undefined}
        actions={(
          <>
            <MoreMenu items={trash.menuItems} />
            {canCreateBusiness && hasBusinesses && (
              <Button onClick={() => setAddOpen(true)}><Plus />{COPY.createBusiness}</Button>
            )}
          </>
        )}
      />

      {message && (
        <p className="mb-4 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">{message}</p>
      )}

      {(total > SEARCH_FROM || search) && (
        <ListToolbar>
          <SearchBox value={search} onSearch={(q) => update({ [SEARCH_PARAM]: q, [PAGE_PARAM]: null })} />
        </ListToolbar>
      )}

      {data ? (
        <>
          <BusinessRows data={data} search={search} canCreate={canCreateBusiness} onCreate={() => setAddOpen(true)} />
          <Pager page={page} totalPages={data.total_pages} onPage={(p) => update({ [PAGE_PARAM]: p > 1 ? p : null })} />
        </>
      ) : (
        !error && <BusinessListSkeleton />
      )}

      <CreateBusinessDialog open={addOpen || creating} onOpenChange={handleAddOpenChange} onCreated={handleCreated} />
      {trash.dialogs}
    </div>
  );
}
