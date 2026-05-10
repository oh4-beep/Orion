import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AgentRunBridge,
  AiInputBar,
  AiMiniWindow,
  getAllKeys,
  hasAnyKey,
  SelectionAskAi,
  useChatStore,
} from "@/modules/ai";
import { getModel, providerNeedsKey } from "@/modules/ai/config";
import { AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useSnippetsStore } from "@/modules/ai/store/snippetsStore";
import {
  AiDiffStack,
  EditorStack,
  NewEditorDialog,
  type EditorPaneHandle,
} from "@/modules/editor";
import { applyChromeTheme } from "@/modules/editor/lib/applyChromeTheme";
import { Sidebar } from "@/modules/sidebar";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { PreviewStack, type PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  ShortcutsDialog,
  useGlobalShortcuts,
  type ShortcutHandlers,
} from "@/modules/shortcuts";
import { StatusBar } from "@/modules/statusbar";
import {
  loadWorkspace,
  saveWorkspace,
  useTabs,
  useWorkspaceCwd,
  type PersistedWorkspace,
} from "@/modules/tabs";
import { TerminalStack, type TerminalPaneHandle } from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import {
  CommandPalette,
  pickAndOpenFolder,
  QuickOpen,
  useWorkspaceStore,
  WelcomeScreen,
  type PaletteCommand,
} from "@/modules/workspace";
import {
  EDITOR_THEME_LABELS,
  EDITOR_THEMES,
  onKeysChanged,
  setEditorTheme,
  setVimMode,
} from "@/modules/settings/store";
import { homeDir } from "@tauri-apps/api/path";
import type { SearchAddon } from "@xterm/addon-search";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.host === ub.host && ua.protocol === ub.protocol;
  } catch {
    return a === b;
  }
}

function AppInner({ hydrated }: { hydrated: PersistedWorkspace | null }) {
  const hydrateState = useMemo(() => {
    if (!hydrated) return null;
    const rehydratedTabs = hydrated.tabs.map((t) =>
      t.kind === "editor"
        ? { id: t.id, kind: "editor" as const, title: t.title, path: t.path, dirty: false }
        : { id: t.id, kind: "terminal" as const, title: t.title, cwd: t.cwd },
    );
    return {
      tabs: rehydratedTabs,
      activeId: hydrated.activeId ?? rehydratedTabs[0]?.id ?? 1,
      nextId: hydrated.nextId,
    };
  }, [hydrated]);
  const {
    tabs,
    activeId,
    setActiveId,
    getNextId,
    newTab,
    openFileTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
  } = useTabs(undefined, hydrateState);

  // Persist tab state with debounce. Only fires on real changes; LazyStore
  // already throttles disk writes via its `autoSave` option but we add a
  // small extra debounce to coalesce rapid edits (typing-induced dirty
  // flips, etc.) — keeps this off the hot path.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void saveWorkspace({ tabs, activeId, nextId: getNextId() });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [tabs, activeId, getNextId]);

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const detectedUrls = useRef<Map<number, string>>(new Map());
  const [activeDetectedUrl, setActiveDetectedUrl] = useState<string | null>(
    null,
  );
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  const workspaceRoot = useWorkspaceStore((s) => s.currentRoot);
  const hydrateWorkspace = useWorkspaceStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateWorkspace();
  }, [hydrateWorkspace]);

  const openFolderAndStart = useCallback(async () => {
    const picked = await pickAndOpenFolder(workspaceRoot ?? home ?? undefined);
    if (!picked) return;
    // Open a fresh terminal rooted at the chosen folder so the user lands
    // inside a usable workspace immediately.
    newTab(picked);
  }, [workspaceRoot, home, newTab]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const miniOpen = useChatStore((s) => s.mini.open);
  const openMini = useChatStore((s) => s.openMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);
  // The chat composer should be available whenever there's a usable model:
  // either an API key is configured for some hosted provider, OR the user has
  // selected a keyless local provider (Ollama / LM Studio).
  const selectedProvider = getModel(selectedModelId).provider;
  const hasComposer =
    hasAnyKey(apiKeys) || !providerNeedsKey(selectedProvider);

  const [keysLoaded, setKeysLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    reload();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys]);

  // Hydrate the cross-window preference store and mirror the default model
  // into chatStore so the dropdown reflects what the user picked in Settings.
  const initPrefs = usePreferencesStore((s) => s.init);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const editorThemeId = usePreferencesStore((s) => s.editorTheme);
  // Apply the editor palette to the entire app chrome so the sidebar, header,
  // borders, etc. don't clash with the editor surface.
  useEffect(() => {
    if (!prefsHydrated) return;
    applyChromeTheme(editorThemeId);
  }, [editorThemeId, prefsHydrated]);
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  // Auto-start the Ollama daemon if any selection points at it.
  useEffect(() => {
    if (!prefsHydrated) return;
    const prefs = usePreferencesStore.getState();
    const usesOllama =
      prefs.defaultModelId === "ollama-local" ||
      prefs.autocompleteProvider === "ollama";
    if (!usesOllama) return;
    void import("@/modules/ai/lib/ollama").then(({ ensureOllamaRunning }) => {
      void ensureOllamaRunning(prefs.ollamaBaseURL);
    });
  }, [prefsHydrated]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isAiDiffTab = activeTab?.kind === "ai-diff";

  // When an AI diff is approved (write_file applied to disk), reload any
  // open editor tabs for that path so the user sees the new content. We
  // track which approvalIds we've already handled to fire the reload only
  // once per applied diff.
  const appliedDiffsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of tabs) {
      if (t.kind !== "ai-diff") continue;
      if (t.status !== "approved") continue;
      if (appliedDiffsRef.current.has(t.approvalId)) continue;
      appliedDiffsRef.current.add(t.approvalId);
      for (const e of tabs) {
        if (e.kind !== "editor") continue;
        if (e.path !== t.path) continue;
        editorRefs.current.get(e.id)?.reload();
      }
    }
  }, [tabs]);

  const { explorerRoot: derivedExplorerRoot, inheritedCwdForNewTab } =
    useWorkspaceCwd(activeTab, tabs, home);
  // The user-chosen workspace root (via ⌘O / welcome screen) takes precedence
  // over whatever the active terminal's cwd happens to be.
  const explorerRoot = workspaceRoot ?? derivedExplorerRoot;

  useEffect(() => {
    setActiveSearchAddon(searchAddons.current.get(activeId) ?? null);
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
    setActiveDetectedUrl(detectedUrls.current.get(activeId) ?? null);
  }, [activeId]);

  const handleDetectedLocalUrl = useCallback(
    (id: number, url: string) => {
      detectedUrls.current.set(id, url);
      if (id === activeId) setActiveDetectedUrl(url);
    },
    [activeId],
  );

  // Suppress the chip once a preview tab already targets the detected URL —
  // avoids prompting users to re-open a tab they already have.
  const detectedPreviewUrl = useMemo(() => {
    if (!isTerminalTab || !activeDetectedUrl) return null;
    const alreadyOpen = tabs.some(
      (t) => t.kind === "preview" && sameOrigin(t.url, activeDetectedUrl),
    );
    return alreadyOpen ? null : activeDetectedUrl;
  }, [isTerminalTab, activeDetectedUrl, tabs]);

  const handleSearchReady = useCallback(
    (id: number, addon: SearchAddon) => {
      searchAddons.current.set(id, addon);
      if (id === activeId) setActiveSearchAddon(addon);
    },
    [activeId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      searchAddons.current.delete(id);
      terminalRefs.current.delete(id);
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      detectedUrls.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        const ok = window.confirm(
          `"${t.title}" has unsaved changes. Close anyway?`,
        );
        if (!ok) return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      return terminalRefs.current.get(activeId)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [hasComposer, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      // Dispatch a window event the composer listens for. Same pattern as
      // selections — keeps file-explorer decoupled from the AI module.
      window.dispatchEvent(
        new CustomEvent<string>("terax:ai-attach-file", { detail: path }),
      );
      openPanel();
      focusInput(null);
    },
    [hasComposer, openPanel, focusInput],
  );

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const isInsideAi = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return !!(
        el.closest("[data-selection-ask-ai]") ||
        el.closest("[data-ai-input-bar]") ||
        el.closest("[data-ai-mini-window]")
      );
    };

    const onDown = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setAskPopup(null);
    };
    const onUp = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      // Defer one tick so xterm/CodeMirror finalize the selection.
      setTimeout(() => {
        const text = captureActiveSelection();
        if (text && text.trim().length > 0) {
          setAskPopup({ x: e.clientX, y: e.clientY });
        } else {
          setAskPopup(null);
        }
      }, 0);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [captureActiveSelection]);

  const onAskFromSelection = useCallback(() => {
    askFromSelection();
    setAskPopup(null);
  }, [askFromSelection]);

  const openNewTab = useCallback(() => {
    // Prefer the user-chosen workspace root if there is one; otherwise fall
    // back to the active terminal's cwd / home.
    newTab(workspaceRoot ?? inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab, workspaceRoot]);

  const sendCd = useCallback(
    (path: string) => {
      const term = terminalRefs.current.get(activeId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\n`);
      term.focus();
    },
    [activeId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const id = newTab(path);
      setTimeout(() => {
        const t = terminalRefs.current.get(id);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\n`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      openFileTab(path);
    },
    [openFileTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const handlePathDeleted = useCallback(
    (path: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === path || t.path.startsWith(`${path}/`)) {
          disposeTab(t.id);
        }
      }
    },
    [tabs, disposeTab],
  );

  const activeFilePath = activeTab?.kind === "editor" ? activeTab.path : null;

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      {
        id: "file.openFolder",
        group: "File",
        label: "Open folder…",
        shortcut: ["⌘", "O"],
        run: () => void openFolderAndStart(),
      },
      {
        id: "file.newTerminal",
        group: "File",
        label: "New terminal",
        shortcut: ["⌘", "T"],
        run: openNewTab,
      },
      {
        id: "file.newFile",
        group: "File",
        label: "New file",
        shortcut: ["⌘", "E"],
        run: () => setNewEditorOpen(true),
      },
      {
        id: "file.quickOpen",
        group: "File",
        label: "Go to file…",
        shortcut: ["⌘", "P"],
        run: () => setQuickOpenOpen(true),
      },
      {
        id: "view.toggleSidebar",
        group: "View",
        label: "Toggle sidebar",
        shortcut: ["⌘", "B"],
        run: toggleSidebar,
      },
      {
        id: "view.shortcuts",
        group: "View",
        label: "Show keyboard shortcuts",
        shortcut: ["⌘", "K"],
        run: () => setShortcutsOpen(true),
      },
      {
        id: "view.welcome",
        group: "View",
        label: "Show welcome screen",
        run: () => {
          for (const t of tabs) disposeTab(t.id);
        },
      },
      {
        id: "ai.toggle",
        group: "AI",
        label: "Toggle AI panel",
        shortcut: ["⌘", "I"],
        run: togglePanelAndFocus,
      },
      {
        id: "settings.open",
        group: "Settings",
        label: "Open settings",
        run: () => void openSettingsWindow(),
      },
      {
        id: "settings.toggleVim",
        group: "Settings",
        label: "Toggle Vim mode",
        run: () => {
          const cur = usePreferencesStore.getState().vimMode;
          void setVimMode(!cur);
        },
      },
    ];
    for (const id of EDITOR_THEMES) {
      cmds.push({
        id: `theme.${id}`,
        group: "Theme",
        label: `Set theme: ${EDITOR_THEME_LABELS[id]}`,
        hint: id === editorThemeId ? "active" : undefined,
        run: () => void setEditorTheme(id),
      });
    }
    return cmds;
  }, [
    openFolderAndStart,
    openNewTab,
    toggleSidebar,
    togglePanelAndFocus,
    tabs,
    disposeTab,
    editorThemeId,
  ]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": () => handleClose(activeId),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "search.focus": () => searchInlineRef.current?.focus(),
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "shortcuts.open": () => setShortcutsOpen((v) => !v),
      "sidebar.toggle": toggleSidebar,
      "workspace.openFolder": () => void openFolderAndStart(),
      "workspace.quickOpen": () => setQuickOpenOpen(true),
      "workspace.commandPalette": () => setPaletteOpen(true),
    }),
    [
      activeId,
      cycleTab,
      handleClose,
      openNewTab,
      openPreviewTab,
      selectByIndex,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
      openFolderAndStart,
    ],
  );

  useGlobalShortcuts(shortcutHandlers);

  const registerTerminalHandle = useCallback(
    (id: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(id, h);
      else terminalRefs.current.delete(id);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(id, h);
      else editorRefs.current.delete(id);
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const handleTerminalCwd = useCallback(
    (id: number, cwd: string) => updateTab(id, { cwd }),
    [updateTab],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeSearchAddon)
      return { kind: "terminal", addon: activeSearchAddon };
    if (isEditorTab && activeEditorHandle)
      return { kind: "editor", handle: activeEditorHandle };
    return null;
  }, [isTerminalTab, isEditorTab, activeSearchAddon, activeEditorHandle]);

  const activeCwd =
    activeTab?.kind === "terminal" ? (activeTab.cwd ?? null) : null;

  useEffect(() => {
    const findCwd = () => {
      const active = tabs.find((x) => x.id === activeId);
      if (active?.kind === "terminal" && active.cwd) return active.cwd;
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i];
        if (t.kind === "terminal" && t.cwd) return t.cwd;
      }
      return explorerRoot ?? home ?? null;
    };

    setLive({
      getCwd: findCwd,
      getTerminalContext: () => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return null;
        return terminalRefs.current.get(activeId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "terminal") return false;
        const term = terminalRefs.current.get(activeId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind === "editor" ? t.path : null;
      },
      openPreview: (url: string) => {
        openPreviewTab(url);
        return true;
      },
    });
  }, [setLive, activeId, tabs, explorerRoot, home, openPreviewTab]);

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => setNewEditorOpen(true)}
            onClose={handleClose}
            onToggleSidebar={toggleSidebar}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize="225px"
                minSize="130px"
                maxSize="450px"
                collapsible
                collapsedSize={0}
              >
                <Sidebar
                  rootPath={explorerRoot}
                  onOpenFile={handleOpenFile}
                  onPathRenamed={handlePathRenamed}
                  onPathDeleted={handlePathDeleted}
                  onRevealInTerminal={cdInNewTab}
                  onAttachToAgent={handleAttachFileToAgent}
                  onOpenAi={togglePanelAndFocus}
                  onShowWelcome={() => {
                    for (const t of tabs) disposeTab(t.id);
                  }}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isTerminalTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isTerminalTab}
                    >
                      <TerminalStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerTerminalHandle}
                        onSearchReady={handleSearchReady}
                        onCwd={handleTerminalCwd}
                        onDetectedLocalUrl={handleDetectedLocalUrl}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isEditorTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isEditorTab}
                    >
                      <EditorStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerEditorHandle}
                        onDirtyChange={handleEditorDirty}
                        onCloseTab={disposeTab}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isPreviewTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isPreviewTab}
                    >
                      <PreviewStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerPreviewHandle}
                        onUrlChange={handlePreviewUrl}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isAiDiffTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isAiDiffTab}
                    >
                      <AiDiffStack
                        tabs={tabs}
                        activeId={activeId}
                        onAccept={(id) => respondToApproval(id, true)}
                        onReject={(id) => respondToApproval(id, false)}
                      />
                    </div>
                    {tabs.length === 0 ? (
                      <div className="absolute inset-0 z-10 bg-background">
                        <WelcomeScreen
                          onNewTerminal={openNewTab}
                          onNewEditor={() => setNewEditorOpen(true)}
                          onOpenSettings={() => void openSettingsWindow()}
                          onOpenAi={togglePanelAndFocus}
                          onFolderOpened={(path) => newTab(path)}
                          defaultPickerPath={
                            workspaceRoot ?? home ?? undefined
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  {keysLoaded ? (
                    <motion.div
                      data-ai-input-bar
                      initial={false}
                      animate={{
                        height: panelOpen ? "auto" : 0,
                        opacity: panelOpen ? 1 : 0,
                      }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                      aria-hidden={!panelOpen}
                    >
                      {hasComposer ? (
                        <AiInputBar />
                      ) : (
                        <AiInputBarConnect
                          onAdd={() => void openSettingsWindow("models")}
                        />
                      )}
                    </motion.div>
                  ) : null}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>

          <StatusBar
            cwd={activeCwd}
            filePath={activeFilePath}
            home={home}
            onCd={sendCd}
            onOpenMini={openMini}
            hasComposer={hasComposer}
            detectedPreviewUrl={detectedPreviewUrl}
            onOpenPreview={() => {
              if (detectedPreviewUrl) openPreviewTab(detectedPreviewUrl);
            }}
          />

          {hasComposer ? (
            <AgentRunBridge
              openAiDiffTab={openAiDiffTab}
              setAiDiffStatus={setAiDiffStatus}
            />
          ) : null}

          <AnimatePresence>
            {miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
            {askPopup ? (
              <SelectionAskAi
                key="ask-ai-popup"
                x={askPopup.x}
                y={askPopup.y}
                onAsk={onAskFromSelection}
                onDismiss={() => setAskPopup(null)}
              />
            ) : null}
          </AnimatePresence>

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />

          <QuickOpen
            open={quickOpenOpen}
            onOpenChange={setQuickOpenOpen}
            rootPath={explorerRoot ?? home}
            onPick={handleOpenFile}
          />

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            commands={paletteCommands}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  // Mount the composer provider whenever any provider has a key — independent
  // of panelOpen — so toggling the panel never re-mounts terminals/editors.
  if (hasComposer) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}

export default function App() {
  // Two-phase mount: load persisted tab state once before instantiating the
  // app tree so `useTabs` can seed from it. `loaded === undefined` means
  // still loading; `null` means no prior state (fresh install or empty).
  const [loaded, setLoaded] = useState<PersistedWorkspace | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await useWorkspaceStore.getState().hydrate();
        // First launch with the welcome feature: throw away any persisted
        // tabs from a previous version so the welcome screen actually shows
        // (otherwise an old auto-spawned terminal tab masks it forever).
        const isFirst =
          await useWorkspaceStore.getState().consumeFirstLaunch();
        if (isFirst) {
          if (alive) setLoaded(null);
          return;
        }
        const s = await loadWorkspace();
        if (alive) setLoaded(s);
      } catch {
        if (alive) setLoaded(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (loaded === undefined) return null;
  return <AppInner hydrated={loaded} />;
}
