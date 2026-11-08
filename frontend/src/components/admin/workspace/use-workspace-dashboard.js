'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getWorkspaceDashboard } from '@/lib/services/dashboard.service';
import { WORKSPACE_COPY as COPY } from '@/lib/copy/workspace';

// Loads GET /me/dashboard for the given page/search; keeps the last good data while reloading.
export function useWorkspaceDashboard({ page, pageSize, search }) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    getWorkspaceDashboard({ page, pageSize, search })
      .then((data) => { if (active) setState({ data, error: null, loading: false }); })
      .catch(() => { if (active) setState((prev) => ({ ...prev, error: COPY.loadFailed, loading: false })); });
    return () => { active = false; };
  }, [page, pageSize, search, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { ...state, reload };
}

const subscribe = () => () => {};
const MINUTE_MS = 60_000;

// The current time on the client, stable to the minute; null on the server and during hydration
// (the greeting and the date follow the viewer's clock, never the server's).
export function useClientMinute() {
  const minute = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / MINUTE_MS), () => null);
  return minute === null ? null : new Date(minute * MINUTE_MS);
}
