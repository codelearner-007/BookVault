'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { handleResponse } from '@/lib/services/api-utils';

const PAGE_SIZE = 20;

function formatDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(dateString));
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
        const res = await fetch(`/api/v1/audit/my-logs?${params}`, { credentials: 'include' });
        const response = await handleResponse(res);
        setLogs(response.items ?? []);
        setTotalPages(response.total_pages ?? 1);
        setTotal(response.total ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity logs');
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, [page]);

  const startRow = (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A log of all actions performed on your account
        </p>
      </div>

      {/* Table card */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">No activity recorded yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Actions you perform will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-semibold">Date / Time</TableHead>
                      <TableHead className="font-semibold">Module</TableHead>
                      <TableHead className="font-semibold">Action</TableHead>
                      <TableHead className="font-semibold">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          {log.module ? (
                            <Badge
                              variant="secondary"
                              className="bg-primary/10 text-primary border-primary/20 font-medium"
                            >
                              {log.module}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{log.action}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.resource_id ? (
                            <code className="bg-muted px-2 py-0.5 rounded text-xs">
                              {log.resource_id.slice(0, 12)}
                            </code>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium text-foreground">{startRow}</span>
                  {' '}–{' '}
                  <span className="font-medium text-foreground">{endRow}</span>
                  {' '}of{' '}
                  <span className="font-medium text-foreground">{total}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1 || loading}
                    className="shadow-sm"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-1">
                    Page{' '}
                    <span className="font-medium text-foreground">{page}</span>
                    {' '}of{' '}
                    <span className="font-medium text-foreground">{totalPages}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages || loading}
                    className="shadow-sm"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
