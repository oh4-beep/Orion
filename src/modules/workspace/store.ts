import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";

const STORE_PATH = "terax-workspace-root.json";
const KEY_ROOT = "currentRoot";
const KEY_RECENTS = "recentRoots";
const KEY_WELCOME_DISABLED = "welcomeDisabled";
const KEY_WELCOME_INTRO_SEEN = "welcomeIntroSeen";

const MAX_RECENTS = 10;

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export type Recent = {
  /** Absolute path. */
  path: string;
  /** Last opened, ms epoch. */
  lastOpened: number;
};

type State = {
  hydrated: boolean;
  /** Folder the user has explicitly opened, if any. Null = no chosen root. */
  currentRoot: string | null;
  /** MRU list of recently opened folders, newest first. */
  recents: Recent[];
  /** When true, welcome screen is suppressed even with no tabs. */
  welcomeDisabled: boolean;

  hydrate: () => Promise<void>;
  openRoot: (path: string) => Promise<void>;
  clearRoot: () => Promise<void>;
  removeRecent: (path: string) => Promise<void>;
  setWelcomeDisabled: (v: boolean) => Promise<void>;
  /**
   * Returns true on the very first launch with the welcome feature, then
   * persists a flag so it returns false thereafter. Call this once at boot
   * to drive a one-shot migration (e.g. wiping stale persisted tabs so the
   * welcome screen actually shows).
   */
  consumeFirstLaunch: () => Promise<boolean>;
};

let initialized = false;

export const useWorkspaceStore = create<State>((set, get) => ({
  hydrated: false,
  currentRoot: null,
  recents: [],
  welcomeDisabled: false,

  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    try {
      const root = (await store.get<string>(KEY_ROOT)) ?? null;
      const recents = (await store.get<Recent[]>(KEY_RECENTS)) ?? [];
      const welcomeDisabled =
        (await store.get<boolean>(KEY_WELCOME_DISABLED)) ?? false;
      set({
        currentRoot: typeof root === "string" && root.length > 0 ? root : null,
        recents: Array.isArray(recents) ? recents : [],
        welcomeDisabled,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  openRoot: async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    const now = Date.now();
    const recents = [
      { path: trimmed, lastOpened: now },
      ...get().recents.filter((r) => r.path !== trimmed),
    ].slice(0, MAX_RECENTS);
    set({ currentRoot: trimmed, recents });
    await store.set(KEY_ROOT, trimmed);
    await store.set(KEY_RECENTS, recents);
    await store.save();
  },

  clearRoot: async () => {
    set({ currentRoot: null });
    await store.set(KEY_ROOT, null);
    await store.save();
  },

  removeRecent: async (path: string) => {
    const recents = get().recents.filter((r) => r.path !== path);
    set({ recents });
    await store.set(KEY_RECENTS, recents);
    await store.save();
  },

  setWelcomeDisabled: async (v: boolean) => {
    set({ welcomeDisabled: v });
    await store.set(KEY_WELCOME_DISABLED, v);
    await store.save();
  },

  consumeFirstLaunch: async () => {
    try {
      const seen = (await store.get<boolean>(KEY_WELCOME_INTRO_SEEN)) ?? false;
      if (seen) return false;
      await store.set(KEY_WELCOME_INTRO_SEEN, true);
      await store.save();
      return true;
    } catch {
      return false;
    }
  },
}));
