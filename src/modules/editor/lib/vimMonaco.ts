import type * as MonacoNs from "monaco-editor";

type VimMode = { dispose: () => void };
type Token = { active: boolean; instance: VimMode | null };

export function initVim(
  editor: MonacoNs.editor.IStandaloneCodeEditor,
  statusBar: HTMLElement | null,
): Token {
  const token: Token = { active: true, instance: null };
  void import("monaco-vim").then((mod) => {
    if (!token.active) return;
    const initVimMode = (mod as { initVimMode?: typeof initFn }).initVimMode;
    if (typeof initVimMode === "function") {
      token.instance = initVimMode(editor, statusBar);
    }
  });
  return token;
}

export function disposeVim(token: unknown): void {
  if (!token) return;
  const t = token as Token;
  t.active = false;
  if (t.instance && typeof t.instance.dispose === "function") {
    t.instance.dispose();
    t.instance = null;
  }
}

declare function initFn(
  editor: MonacoNs.editor.IStandaloneCodeEditor,
  sb: HTMLElement | null,
): VimMode;
