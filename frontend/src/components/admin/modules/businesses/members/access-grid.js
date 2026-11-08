import {
  ACCESS_MODE_CUSTOM, ACCESS_MODE_FULL, AREA_RIGHTS, IMPLIES_VIEW, RIGHT_VIEW,
} from '@/lib/constants/access-rights';
import { RENAMED_TABS, tabMeta } from '@/lib/navigation/business-tabs';

/*
  The custom access grid as plain data: { [area_key]: right[] }.
  Rules (D-39): create, edit and delete each tick view; unticking view clears the row.
  View-only areas take view and nothing else. Presets only tick boxes.
*/

const SETTINGS_TAB = 'settings';
const SETTINGS_AREA_PREFIX = 'settings.';
const BUSINESS_LEVEL_ORDER = Number.MAX_SAFE_INTEGER - 1;
const SETTINGS_ORDER = Number.MAX_SAFE_INTEGER;

function areaOrder(area) {
  if (area.key.startsWith(SETTINGS_AREA_PREFIX)) return SETTINGS_ORDER;
  if (!area.tab_key) return BUSINESS_LEVEL_ORDER;
  return tabMeta(RENAMED_TABS[area.tab_key] ?? area.tab_key).order;
}

// Grid rows for a business: grantable areas of its enabled tabs (Settings opens its settings.* areas),
// plus the business-level areas that belong to no tab (history, export ...), in sidebar order.
export function gridRows(areas, tabs) {
  const enabled = new Set(tabs.filter((tab) => tab.enabled).map((tab) => tab.key));
  const visible = (area) => {
    if (area.key.startsWith(SETTINGS_AREA_PREFIX)) return enabled.has(SETTINGS_TAB);
    if (!area.tab_key) return true;
    return enabled.has(RENAMED_TABS[area.tab_key] ?? area.tab_key);
  };
  return areas
    .filter(visible)
    .map((area, index) => ({ ...area, index }))
    .sort((a, b) => areaOrder(a) - areaOrder(b) || a.index - b.index);
}

export function toggleRight(grid, area, right, checked) {
  const current = new Set(grid[area.key] ?? []);
  if (right === RIGHT_VIEW && !checked) {
    const { [area.key]: _cleared, ...rest } = grid;
    return rest;
  }
  if (checked) {
    current.add(right);
    if (IMPLIES_VIEW.includes(right)) current.add(RIGHT_VIEW);
  } else {
    current.delete(right);
  }
  return { ...grid, [area.key]: AREA_RIGHTS.filter((r) => current.has(r)) };
}

// A preset's ticks for the rows shown; view-only rows keep only view.
export function presetGrid(preset, rows) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const grid = {};
  for (const { area_key: key, rights } of preset.areas) {
    const row = byKey.get(key);
    if (!row) continue;
    const allowed = row.is_view_only ? rights.filter((r) => r === RIGHT_VIEW) : rights;
    if (allowed.length) grid[key] = AREA_RIGHTS.filter((r) => allowed.includes(r));
  }
  return grid;
}

export function gridFromAccess(access) {
  return Object.fromEntries((access?.areas ?? []).map((entry) => [entry.area_key, entry.rights]));
}

// The access body of the API: Full sends no areas; Custom sends the ticked rows only.
export function accessPayload(fullAccess, grid) {
  if (fullAccess) return { access_mode: ACCESS_MODE_FULL, areas: [] };
  const areas = Object.entries(grid)
    .filter(([, rights]) => rights.length > 0)
    .map(([area_key, rights]) => ({ area_key, rights }))
    .sort((a, b) => a.area_key.localeCompare(b.area_key));
  return { access_mode: ACCESS_MODE_CUSTOM, areas };
}

export function sameAccess(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
