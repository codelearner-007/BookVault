'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Plus, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreMenu, PageHeader } from '@/components/common/page';
import { getCoaTree } from '@/lib/services/coa.service';
import CoaPanel from '../coa/CoaPanel';
import { STATEMENTS, STATEMENT_TITLES } from '../coa/coa-tree';
import { todayIso } from '../ledger/ledger-parts';

const STARTING_BALANCES_HREF = '?tab=settings&page=starting-balances';
const PANELS = [STATEMENTS.balanceSheet, STATEMENTS.pl];

function CoaSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 flex items-end justify-between gap-4 max-md:mb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-control w-36 rounded-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {PANELS.map((panel) => (
          <Card key={panel}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-2">
              {[0, 1, 2].map((group) => (
                <div key={group} className="space-y-2">
                  <div className="flex gap-4"><Skeleton className="h-row flex-1" /><Skeleton className="h-row w-24" /></div>
                  <div className="ms-6 flex gap-4"><Skeleton className="h-row flex-1" /><Skeleton className="h-row w-24" /></div>
                  <div className="ms-6 flex gap-4"><Skeleton className="h-row flex-1" /><Skeleton className="h-row w-24" /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// One primary ("New Account", choosing the statement); other actions in the More menu.
function CoaHeaderActions({ panelRefs }) {
  const router = useRouter();
  return (
    <>
      <MoreMenu
        items={[
          { label: 'New Balance Sheet group', icon: Plus, onSelect: () => panelRefs.current[STATEMENTS.balanceSheet]?.openNewGroup() },
          { label: 'New Profit and Loss group', icon: Plus, onSelect: () => panelRefs.current[STATEMENTS.pl]?.openNewGroup() },
          { label: 'Starting balances', icon: Scale, onSelect: () => router.push(STARTING_BALANCES_HREF), separatorBefore: true },
        ]}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus />
            New Account
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {PANELS.map((panel) => (
            <DropdownMenuItem key={panel} onSelect={() => panelRefs.current[panel]?.openNewAccount()}>{STATEMENT_TITLES[panel]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function Notice({ children }) {
  return <div role="alert" className="mb-6 rounded-control bg-bad-soft px-4 py-3 text-sm text-bad">{children}</div>;
}

// ?tab=settings&page=chart-of-accounts: the 5 fixed roots with their groups, accounts and balances as at today.
export default function BusinessChartOfAccounts({ business }) {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const panelRefs = useRef({});

  // notice: message of a failed change, shown above the reloaded chart.
  const fetchTree = useCallback(async (nextNotice = null) => {
    setNotice(nextNotice);
    try {
      setTree(await getCoaTree(business.id, todayIso()));
      setError(null);
    } catch (err) {
      setError(err?.message ?? 'Failed to load chart of accounts.');
    }
  }, [business.id]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  if (!tree && !error) return <CoaSkeleton />;

  const back = (
    <Button variant="ghost" size="icon" asChild>
      <Link href="?tab=settings" aria-label="Back to settings"><ArrowLeft /></Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Chart of Accounts"
        description={tree ? `Balances as at ${tree.as_at}` : undefined}
        back={back}
        actions={tree && <CoaHeaderActions panelRefs={panelRefs} />}
      />
      {error && <Notice>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {tree && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          {PANELS.map((panel) => (
            <CoaPanel
              key={panel}
              ref={(node) => { panelRefs.current[panel] = node; }}
              statement={panel}
              roots={tree.roots.filter((root) => root.statement_type === panel)}
              openingDate={tree.opening_date}
              businessId={business.id}
              onRefresh={fetchTree}
            />
          ))}
        </div>
      )}
    </>
  );
}
