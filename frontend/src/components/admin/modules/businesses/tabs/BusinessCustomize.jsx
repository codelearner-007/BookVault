'use client';

import { useRef, useState } from 'react';
import { Loader2, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ListCard, PageHeader } from '@/components/common/page';
import { updateBusinessTabs } from '@/lib/services/business.service';
import { groupTabs } from '@/lib/navigation/business-tabs';
import { CUSTOMIZE_TABS_COPY as COPY } from '@/lib/copy/customize-tabs';

// Start padding per tree level (Manager shows children indented under their parent).
const INDENT = ['ps-4', 'ps-9', 'ps-14'];

const snapshot = (tabs) => new Map(tabs.map((t) => [t.key, t.enabled]));

// Every key below `key` in the parent tree (a child tab is only on while its parent is on).
function descendants(tabs, key) {
  const children = tabs.filter((t) => t.parent_key === key).map((t) => t.key);
  return children.flatMap((child) => [child, ...descendants(tabs, child)]);
}

function depth(byKey, tab) {
  let level = 0;
  for (let parent = byKey.get(tab.parent_key); parent; parent = byKey.get(parent.parent_key)) level += 1;
  return level;
}

function TabRow({ tab, level, parent, built, disabled, onToggle }) {
  const blocked = parent && !parent.enabled;
  return (
    <li
      className={`flex min-h-row items-center justify-between gap-4 border-b border-row-divider pe-4 last:border-b-0 ${INDENT[Math.min(level, INDENT.length - 1)]}`}
    >
      <span className="min-w-0">
        <span className="block">{tab.label}</span>
        {(blocked || !built) && (
          <span className="block text-sm text-muted-foreground">
            {blocked ? COPY.needsParent(parent.label) : COPY.comingSoon}
          </span>
        )}
      </span>
      <Switch
        checked={tab.enabled}
        onCheckedChange={() => onToggle(tab)}
        aria-label={COPY.enable(tab.label)}
        disabled={disabled || blocked}
      />
    </li>
  );
}

// builtTabs: keys of tabs that have a page; the rest are marked "Coming soon".
export default function BusinessCustomize({ business, tabs, setTabs, onSaved, builtTabs }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const savedRef = useRef(snapshot(tabs));
  const isDirty = tabs.some((t) => savedRef.current.get(t.key) !== t.enabled);
  const byKey = new Map(tabs.map((t) => [t.key, t]));

  function toggleTab(tab) {
    const turningOff = tab.enabled;
    const affected = new Set([tab.key, ...(turningOff ? descendants(tabs, tab.key) : [])]);
    setTabs((prev) => prev.map((t) => (affected.has(t.key) ? { ...t, enabled: !turningOff } : t)));
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const data = await updateBusinessTabs(business.id, tabs.map((t) => ({ key: t.key, enabled: t.enabled })));
      const saved = data.items || [];
      savedRef.current = snapshot(saved);
      onSaved(saved);
    } catch {
      setError(COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const actions = isDirty && (
    <Button onClick={handleSave} disabled={saving}>
      {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
      {saving ? COPY.saving : COPY.save}
    </Button>
  );

  return (
    <>
      <PageHeader title={COPY.title} description={COPY.description(business.name)} actions={actions} />
      {error && <p className="mb-4 text-sm text-bad" role="alert">{error}</p>}

      {tabs.length === 0 ? (
        <ListCard className="max-w-prose">
          <EmptyState icon={Sliders} title={COPY.empty} description={COPY.emptyDescription} />
        </ListCard>
      ) : (
        <div className="max-w-prose space-y-6">
          {groupTabs(tabs).map((group) => (
            <section key={group.key} aria-label={group.label ?? COPY.ungrouped}>
              {group.label && <h2 className="label-caps mb-2 px-4">{group.label}</h2>}
              <ListCard>
                <ul>
                  {group.tabs.map((tab) => (
                    <TabRow
                      key={tab.key}
                      tab={tab}
                      level={depth(byKey, tab)}
                      parent={byKey.get(tab.parent_key)}
                      built={!builtTabs || builtTabs.includes(tab.key)}
                      disabled={saving}
                      onToggle={toggleTab}
                    />
                  ))}
                </ul>
              </ListCard>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
