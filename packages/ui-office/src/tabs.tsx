import { useEffect, useState } from "react";
import { officeCopy, type Lang } from "./copy.js";

/**
 * The office tools are one tab per field module plus the farm's own settings
 * (plan §4.2, §4.3). Both tools draw the same strip, so the rule for what is
 * on it lives here rather than in either app.
 */

/**
 * Field modules that have an office surface today, in the order the office
 * meets them (plan §11's build order). A module the farm is licensed for but
 * which has nothing to show yet is not a tab — an empty tab is worse than no
 * tab. Add the code here the day that module's panel exists.
 */
export const MODULE_TABS = ["veldnotas", "boord", "span", "water", "werkswinkel"] as const;

export const FARM_SETTINGS_TAB = "farm";

/** A module that has an office panel. `shell.tsx` is typed against this, so a tab without a panel will not compile. */
export type ModuleTab = (typeof MODULE_TABS)[number];

export type TabId = ModuleTab | typeof FARM_SETTINGS_TAB;

export interface Tab {
  id: TabId;
  label: string;
}

/** Module codes are the module names in both languages (plan §4.5). */
export const moduleName = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

/**
 * Which tabs this farm sees. A module tab appears only when Plaashek
 * Management has switched that module on for the farm — the licence ceiling
 * (plan §5), read from `/farm`'s module list, which already counts `grace` as
 * licensed. Farm settings is not a module and is always there; with nothing
 * licensed at all it is the only tab, which is the honest picture of a farm
 * whose licence has lapsed.
 *
 * The farm-settings label comes from this package's own copy, so the tab and
 * the heading inside it cannot say different things.
 */
export function officeTabs(licensedModules: string[], lang: Lang): Tab[] {
  const licensed = new Set(licensedModules);

  return [
    ...MODULE_TABS.filter((code) => licensed.has(code)).map((code) => ({ id: code, label: moduleName(code) })),
    { id: FARM_SETTINGS_TAB, label: officeCopy(lang).farmSettings },
  ];
}

/**
 * Keeps the open tab across a reload, because the office works one tab at a
 * time all morning. A tab that is no longer there — the module was switched
 * off since — falls back to the first one rather than rendering nothing.
 */
export function useActiveTab(tabs: Tab[], storageKey: string): [string, (id: string) => void] {
  const [active, setActive] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });

  const current = tabs.some((tab) => tab.id === active) ? active : (tabs[0]?.id ?? FARM_SETTINGS_TAB);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(storageKey, current);
    } catch {
      // Private window or blocked storage — the tab still works, it just forgets.
    }
  }, [current, storageKey]);

  return [current, setActive];
}

export function Tabs({ tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect: (id: string) => void }) {
  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    onSelect(tabs[(index + step + tabs.length) % tabs.length].id);
  }

  return (
    <div className="tabs no-print" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          className={tab.id === active ? "tab on" : "tab"}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: string; children: React.ReactNode }) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
