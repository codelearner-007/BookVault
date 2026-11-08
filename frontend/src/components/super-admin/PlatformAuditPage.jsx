'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ListCard, ListToolbar, PageHeader } from '@/components/common/page';
import { listPlatformAudit } from '@/lib/services/audit.service';
import { getModules } from '@/lib/services/modules.service';
import { SUPER_ADMIN_COPY } from '@/lib/copy/super-admin';
import { ListPagination, formatDateTime } from './platform-parts';

const COPY = SUPER_ADMIN_COPY.audit;
const PAGE_SIZE = 50;
const ALL = 'all';
const DAY_MS = 24 * 60 * 60 * 1000;
const SKELETON_ROWS = 8;

// "user_role_assigned" -> "User role assigned"
function actionLabel(action) {
  if (!action) return '—';
  const words = action.replace(/[_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function actorName(log) {
  return log.performed_by || COPY.unknownActor;
}

function periodStart(periodValue) {
  const days = COPY.periods.find((p) => p.value === periodValue)?.days;
  return days ? new Date(Date.now() - days * DAY_MS).toISOString() : undefined;
}

function AuditSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-8 space-y-2 max-md:mb-6">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <ListToolbar>
        <div className="flex gap-2">
          <Skeleton className="h-control w-44" />
          <Skeleton className="h-control w-40" />
        </div>
      </ListToolbar>
      <ListCard>
        <div className="space-y-2 p-2">
          <Skeleton className="h-row-head w-full" />
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <Skeleton key={i} className="h-row w-full" />)}
        </div>
      </ListCard>
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function DetailRow({ term, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-row-divider py-2.5 last:border-b-0">
      <dt className="whitespace-nowrap text-muted-foreground">{term}</dt>
      <dd className="break-all text-end">{value}</dd>
    </div>
  );
}

function DetailDialog({ log, onClose }) {
  const details = Object.entries(log?.details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <Dialog open={!!log} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="md:max-w-lg">
        <DialogHeader>
          <DialogTitle>{COPY.detailTitle}</DialogTitle>
        </DialogHeader>
        {log && (
          <>
            <p className="font-medium">{actionLabel(log.action)}</p>
            <dl className="text-sm">
              <DetailRow term={COPY.detailTime} value={formatDateTime(log.created_at)} />
              <DetailRow term={COPY.detailActor} value={actorName(log)} />
              <DetailRow term={COPY.detailRecord} value={[log.entity_type, log.entity_id].filter(Boolean).join(' · ')} />
              {log.request_id && <DetailRow term={COPY.detailRequest} value={log.request_id} />}
            </dl>
            {details.length > 0 && (
              <section className="space-y-2">
                <h3 className="label-caps">{COPY.details}</h3>
                <dl className="text-sm">
                  {details.map(([key, value]) => <DetailRow key={key} term={key} value={formatValue(value)} />)}
                </dl>
              </section>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{COPY.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditTable({ logs, onView }) {
  const columns = COPY.columns;
  return (
    <Table aria-label={COPY.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{columns.time}</TableHead>
          <TableHead>{columns.actor}</TableHead>
          <TableHead>{columns.action}</TableHead>
          <TableHead>{columns.entity}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id} onClick={() => onView(log)} className="cursor-pointer">
            <TableCell data-card="meta" className="whitespace-nowrap">
              <Button variant="link" onClick={() => onView(log)} aria-label={COPY.view(actionLabel(log.action))}>
                {formatDateTime(log.created_at)}
              </Button>
            </TableCell>
            <TableCell data-card="meta" className="whitespace-nowrap">{actorName(log)}</TableCell>
            <TableCell data-card="title" className="font-medium">{actionLabel(log.action)}</TableCell>
            <TableCell data-card="end" className="whitespace-nowrap text-muted-foreground">{log.entity_type}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Filters({ entities, entity, period, onEntity, onPeriod }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={entity} onValueChange={onEntity}>
        <SelectTrigger className="w-44" aria-label={COPY.entityFilter}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{COPY.allEntities}</SelectItem>
          {entities.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={onPeriod}>
        <SelectTrigger className="w-40" aria-label={COPY.periodFilter}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COPY.periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function PlatformAuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState(ALL);
  const [period, setPeriod] = useState(ALL);
  const [entities, setEntities] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [viewLog, setViewLog] = useState(null);

  const load = useCallback(async (p, entityType, periodValue) => {
    setError(null);
    try {
      setResult(await listPlatformAudit({
        page: p,
        page_size: PAGE_SIZE,
        entity_type: entityType === ALL ? undefined : entityType,
        start_date: periodStart(periodValue),
      }));
    } catch {
      setError(COPY.loadFailed);
      setResult((prev) => prev ?? { items: [], total: 0, total_pages: 1 });
    }
  }, []);

  useEffect(() => {
    load(page, entity, period);
  }, [load, page, entity, period]);

  useEffect(() => {
    getModules().then((data) => setEntities(data.items)).catch(() => setEntities([]));
  }, []);

  if (!result) return <AuditSkeleton />;

  const filtered = entity !== ALL || period !== ALL;
  const footer = (
    <ListPagination page={page} totalPages={Math.max(1, result.total_pages)} total={result.total} onPage={setPage} />
  );

  return (
    <>
      <PageHeader title={COPY.title} description={COPY.description} />
      <ListToolbar>
        <Filters
          entities={entities}
          entity={entity}
          period={period}
          onEntity={(value) => { setEntity(value); setPage(1); }}
          onPeriod={(value) => { setPeriod(value); setPage(1); }}
        />
      </ListToolbar>
      {error && <p className="mb-4 text-sm text-bad" role="alert">{error}</p>}
      <ListCard footer={result.items.length > 0 ? footer : null}>
        {error && result.items.length === 0 ? null : result.items.length === 0 ? (
          <EmptyState icon={ScrollText} title={filtered ? COPY.emptyFiltered : COPY.empty} />
        ) : (
          <AuditTable logs={result.items} onView={setViewLog} />
        )}
      </ListCard>
      <DetailDialog log={viewLog} onClose={() => setViewLog(null)} />
    </>
  );
}
