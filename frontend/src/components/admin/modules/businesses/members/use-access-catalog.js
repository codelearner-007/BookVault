'use client';

import { useEffect, useState } from 'react';
import { listAccessAreas, listAccessPresets } from '@/lib/services/members.service';
import { useBusinessWorkspace } from '@/components/shell/ShellContext';
import { gridRows } from './access-grid';

// The grid's rows (grantable areas of this business's enabled tabs) and the presets, loaded once.
export function useAccessCatalog() {
  const { tabs } = useBusinessWorkspace();
  const [catalog, setCatalog] = useState({ areas: [], presets: [], loading: true, failed: false });

  useEffect(() => {
    let active = true;
    Promise.all([listAccessAreas(), listAccessPresets()])
      .then(([areas, presets]) => {
        if (active) setCatalog({ areas: areas.items, presets: presets.items, loading: false, failed: false });
      })
      .catch(() => {
        if (active) setCatalog({ areas: [], presets: [], loading: false, failed: true });
      });
    return () => {
      active = false;
    };
  }, []);

  return { rows: gridRows(catalog.areas, tabs), presets: catalog.presets, loading: catalog.loading, failed: catalog.failed };
}
