import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as MonacoNs from "monaco-editor";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { ensureMonacoTheme, languageForPath } from "./lib/monacoSetup";
import { useDocument } from "./lib/useDocument";
import { registerInlineCompletions } from "./lib/inlineCompletion";
import { initVim, disposeVim } from "./lib/vimMonaco";
import { getKey } from "@/modules/ai/lib/keyring";
import { onKeysChanged } from "@/modules/settings/store";
import { showExplainWidget } from "./lib/explainWidget";
import { BugScannerController } from "./lib/bugScannerController";

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  reload: () => boolean;
};

type Props = {
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onClose?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane({ path, onDirtyChange, onSaved, onClose }, ref) {
    const { doc, onChange, save, reload } = useDocument({ path, onDirtyChange });
    const reloadRef = useRef(reload);
    reloadRef.current = reload;

    const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoNs | null>(null);
    const apiKeyRef = useRef<string | null>(null);
    const inlineDisposeRef = useRef<(() => void) | null>(null);
    const vimRef = useRef<unknown | null>(null);
    const statusBarRef = useRef<HTMLDivElement>(null);
    const explainDisposeRef = useRef<(() => void) | null>(null);
    const scannerRef = useRef<BugScannerController | null>(null);

    const editorThemeId = usePreferencesStore((s) => s.editorTheme);
    const vimMode = usePreferencesStore((s) => s.vimMode);
    const bugScannerEnabled = usePreferencesStore((s) => s.bugScannerEnabled);
    const [themeName, setThemeName] = useState<string>("vs-dark");

    useEffect(() => {
      let cancelled = false;
      ensureMonacoTheme(editorThemeId).then((name) => {
        if (cancelled) return;
        setThemeName(name);
        monacoRef.current?.editor.setTheme(name);
      });
      return () => {
        cancelled = true;
      };
    }, [editorThemeId]);

    // Refresh API key for inline AI completion provider.
    useEffect(() => {
      let cancelled = false;
      const refresh = async () => {
        const provider = usePreferencesStore.getState().autocompleteProvider;
        if (provider === "lmstudio" || provider === "ollama") {
          apiKeyRef.current = null;
          return;
        }
        const k = await getKey(provider);
        if (!cancelled) apiKeyRef.current = k;
      };
      void refresh();
      let unlistenKeys: (() => void) | undefined;
      void onKeysChanged(() => void refresh()).then((un) => {
        unlistenKeys = un;
      });
      const unsubPrefs = usePreferencesStore.subscribe((state, prev) => {
        if (state.autocompleteProvider !== prev.autocompleteProvider) {
          void refresh();
        }
      });
      return () => {
        cancelled = true;
        unlistenKeys?.();
        unsubPrefs();
      };
    }, []);

    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const pathRef = useRef(path);
    pathRef.current = path;

    const handleMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Apply theme as soon as we have monaco.
      monaco.editor.setTheme(themeName);

      // Cmd/Ctrl+S → save.
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          void (async () => {
            await saveRef.current();
            onSavedRef.current?.();
          })();
        },
      );

      // Inline AI completions via existing provider.
      const lang = languageForPath(pathRef.current);
      inlineDisposeRef.current = registerInlineCompletions(monaco, lang, {
        getPrefs: () => {
          const s = usePreferencesStore.getState();
          return {
            enabled: s.autocompleteEnabled,
            provider: s.autocompleteProvider,
            modelId: s.autocompleteModelId,
            apiKey: apiKeyRef.current,
            lmstudioBaseURL: s.lmstudioBaseURL,
            ollamaBaseURL: s.ollamaBaseURL,
          };
        },
        getPath: () => pathRef.current,
      });

      // Right-click "Explain" context menu action.
      editor.addAction({
        id: "terax.explainSelection",
        label: "Explain with AI",
        contextMenuGroupId: "1_modification",
        contextMenuOrder: 0.5,
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE,
        ],
        run: (ed) => {
          explainDisposeRef.current?.();
          explainDisposeRef.current = showExplainWidget(
            ed as MonacoNs.editor.IStandaloneCodeEditor,
            monaco,
            pathRef.current,
          );
        },
      });

      // Bug scanner controller is created up front; lifecycle (start/stop)
      // is driven by the bugScannerEnabled effect below.
      scannerRef.current = new BugScannerController(
        editor,
        monaco,
        pathRef.current,
      );
      if (usePreferencesStore.getState().bugScannerEnabled) {
        scannerRef.current.start();
      }

      if (usePreferencesStore.getState().vimMode) {
        vimRef.current = initVim(editor, statusBarRef.current);
      }
    };

    // Toggle bug scanner at runtime.
    useEffect(() => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      if (bugScannerEnabled) scanner.start();
      else scanner.stop();
    }, [bugScannerEnabled]);

    // Toggle vim mode at runtime.
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      if (vimMode && !vimRef.current) {
        vimRef.current = initVim(editor, statusBarRef.current);
      } else if (!vimMode && vimRef.current) {
        disposeVim(vimRef.current);
        vimRef.current = null;
      }
    }, [vimMode]);

    // Update model language when path changes (path drives the language).
    useEffect(() => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;
      const lang = languageForPath(path);
      monaco.editor.setModelLanguage(model, lang);
    }, [path]);

    useEffect(() => {
      return () => {
        inlineDisposeRef.current?.();
        explainDisposeRef.current?.();
        explainDisposeRef.current = null;
        scannerRef.current?.dispose();
        scannerRef.current = null;
        if (vimRef.current) {
          disposeVim(vimRef.current);
          vimRef.current = null;
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const editor = editorRef.current;
          if (!editor) return;
          if (!q) {
            editor.trigger("api", "closeFindWidget", null);
            return;
          }
          editor.getAction("actions.find")?.run();
          // Monaco's find widget reads from clipboard / last query — the
          // cleanest cross-version way to seed it is via the global state.
          (editor as unknown as {
            _findController?: { setSearchString: (s: string) => void };
          })._findController?.setSearchString?.(q);
        },
        findNext: () => {
          editorRef.current
            ?.getAction("editor.action.nextMatchFindAction")
            ?.run();
        },
        findPrevious: () => {
          editorRef.current
            ?.getAction("editor.action.previousMatchFindAction")
            ?.run();
        },
        clearQuery: () => {
          editorRef.current?.trigger("api", "closeFindWidget", null);
        },
        getSelection: () => {
          const editor = editorRef.current;
          if (!editor) return null;
          const sel = editor.getSelection();
          const model = editor.getModel();
          if (!sel || !model || sel.isEmpty()) return null;
          return model.getValueInRange(sel);
        },
        getPath: () => path,
        reload: () => reloadRef.current(),
      }),
      [path],
    );

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">Binary file</div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} · preview not supported
          </div>
        </div>
      );
    }
    if (doc.status === "toolarge") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">File too large</div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} exceeds the {formatBytes(doc.limit)} limit.
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            theme={themeName}
            language={languageForPath(path)}
            path={path}
            value={doc.content}
            onChange={(v) => {
              onChange(v ?? "");
              scannerRef.current?.notifyChanged();
            }}
            onMount={handleMount}
            options={{
              fontFamily: '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
              fontSize: 14,
              lineHeight: 22,
              minimap: { enabled: false },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "all",
              roundedSelection: true,
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              wordWrap: "off",
              fontLigatures: true,
              suggest: { showStatusBar: true },
              quickSuggestions: { other: true, comments: false, strings: false },
              inlineSuggest: { enabled: true },
              stickyScroll: { enabled: true },
            }}
          />
        </div>
        <div
          ref={statusBarRef}
          className="hidden font-mono text-[11px] text-muted-foreground"
        />
      </div>
    );
  },
);
