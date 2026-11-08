'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DatabaseBackup, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { BUSINESS_PAGES } from '@/lib/navigation/business-tabs';
import { AREA, can } from '@/lib/navigation/access';
import { exportBusiness } from '@/lib/services/business.service';
import { downloadJson } from '@/lib/utils/download';
import { todayIso } from '../ledger/ledger-parts';

function backupFileName(name) {
  return `${name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'business'}-backup-${todayIso()}.json`;
}

/*
  Summary header actions for this business: Backup (the owner's full JSON export of this business only,
  audited server-side) and History (every change in this business). Hidden without the right.
*/
export default function SummaryActions({ business, onError }) {
  const { access } = useBusinessWorkspace();
  const [saving, setSaving] = useState(false);
  const canBackup = Boolean(access?.is_owner);
  const canHistory = can(access, AREA.history);

  async function backup() {
    setSaving(true);
    try {
      downloadJson(await exportBusiness(business.id), backupFileName(business.name));
    } catch (err) {
      onError(err?.message ?? 'The backup could not be created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {canHistory && (
        <Button variant="ghost" asChild>
          <Link href={`?page=${BUSINESS_PAGES.history}`}><History aria-hidden="true" />History</Link>
        </Button>
      )}
      {canBackup && (
        <Button variant="ghost" onClick={backup} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <DatabaseBackup aria-hidden="true" />}
          Backup
        </Button>
      )}
    </div>
  );
}
