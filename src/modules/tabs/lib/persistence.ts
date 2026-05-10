import { LazyStore } from "@tauri-apps/plugin-store";
import type { Tab } from "./useTabs";

const STORE_PATH = "terax-workspace.json";
const KEY_TABS = "tabs";
const KEY_ACTIVE = "activeId";
const KEY_NEXT_ID = "nextId";

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export type PersistedTerminalTab = {
  id: number;
  kind: "terminal";
  title: string;
  cwd?: string;
};

export type PersistedEditorTab = {
  id: number;
  kind: "editor";
  title: string;
  path: string;
};

export type PersistedTab = PersistedTerminalTab | PersistedEditorTab;

export type PersistedWorkspace = {
  tabs: PersistedTab[];
  activeId: number | null;
  nextId: number;
};

export function toPersisted(tabs: Tab[]): PersistedTab[] {
  const out: PersistedTab[] = [];
  for (const t of tabs) {
    if (t.kind === "terminal") {
      out.push({ id: t.id, kind: "terminal", title: t.title, cwd: t.cwd });
    } else if (t.kind === "editor") {
      out.push({
        id: t.id,
        kind: "editor",
        title: t.title,
        path: t.path,
      });
    }
    // Preview and ai-diff tabs are transient — skipped.
  }
  return out;
}

export async function loadWorkspace(): Promise<PersistedWorkspace | null> {
  const entries = await store.entries();
  let tabs: PersistedTab[] | undefined;
  let activeId: number | null | undefined;
  let nextId: number | undefined;
  for (const [k, v] of entries) {
    if (k === KEY_TABS) tabs = v as PersistedTab[];
    else if (k === KEY_ACTIVE) activeId = v as number | null;
    else if (k === KEY_NEXT_ID) nextId = v as number;
  }
  if (!tabs || tabs.length === 0) return null;
  return {
    tabs,
    activeId: activeId ?? null,
    nextId: nextId ?? Math.max(...tabs.map((t) => t.id), 0) + 1,
  };
}

export async function saveWorkspace(state: {
  tabs: Tab[];
  activeId: number;
  nextId: number;
}): Promise<void> {
  const persisted = toPersisted(state.tabs);
  await Promise.all([
    store.set(KEY_TABS, persisted),
    store.set(KEY_ACTIVE, state.activeId),
    store.set(KEY_NEXT_ID, state.nextId),
  ]);
}
