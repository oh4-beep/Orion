import type * as MonacoNs from "monaco-editor";
import {
  streamExplain,
  type ExplainContext,
  type ExplainTurn,
} from "@/modules/ai/lib/inlineExplain";

const CONTEXT_LINES = 10;

type Editor = MonacoNs.editor.IStandaloneCodeEditor;

/**
 * Mount an inline "Explain" widget under a line range in the editor.
 * Widget is a Monaco view zone (it pushes editor lines down) plus a content
 * widget for absolute-positioned UI controls. Returns a disposer.
 */
export function showExplainWidget(
  editor: Editor,
  _monaco: typeof MonacoNs,
  path: string,
): () => void {
  const model = editor.getModel();
  if (!model) return () => {};

  const sel = editor.getSelection();
  if (!sel) return () => {};

  // Use the selection if it spans content, otherwise the line under the cursor.
  let startLine: number;
  let endLine: number;
  let target: string;
  if (!sel.isEmpty()) {
    startLine = sel.startLineNumber;
    endLine = sel.endLineNumber;
    target = model.getValueInRange(sel);
    if (!target.trim()) {
      target = model.getLineContent(startLine);
      endLine = startLine;
    }
  } else {
    startLine = sel.positionLineNumber;
    endLine = startLine;
    target = model.getLineContent(startLine);
  }

  const totalLines = model.getLineCount();
  const beforeStart = Math.max(1, startLine - CONTEXT_LINES);
  const afterEnd = Math.min(totalLines, endLine + CONTEXT_LINES);
  const before =
    beforeStart < startLine
      ? model.getValueInRange({
          startLineNumber: beforeStart,
          startColumn: 1,
          endLineNumber: startLine - 1,
          endColumn: model.getLineMaxColumn(startLine - 1),
        })
      : "";
  const after =
    afterEnd > endLine
      ? model.getValueInRange({
          startLineNumber: endLine + 1,
          startColumn: 1,
          endLineNumber: afterEnd,
          endColumn: model.getLineMaxColumn(afterEnd),
        })
      : "";

  const ctx: ExplainContext = {
    path,
    target,
    targetStartLine: startLine,
    before,
    after,
    language: model.getLanguageId(),
  };

  const dom = buildWidgetDom();
  let viewZoneId: string | null = null;
  const updateZone = () => {
    editor.changeViewZones((acc) => {
      if (viewZoneId !== null) acc.removeZone(viewZoneId);
      viewZoneId = acc.addZone({
        afterLineNumber: endLine,
        heightInPx: dom.root.offsetHeight || 140,
        domNode: dom.root,
        suppressMouseDown: true,
      });
    });
  };

  // Mount once with an initial estimated height; resize after content renders.
  editor.changeViewZones((acc) => {
    viewZoneId = acc.addZone({
      afterLineNumber: endLine,
      heightInPx: 140,
      domNode: dom.root,
      suppressMouseDown: true,
    });
  });
  // Recompute height on next frame after layout.
  requestAnimationFrame(() => updateZone());

  const history: ExplainTurn[] = [];
  let busy = false;
  let currentAbort: (() => void) | null = null;
  let disposed = false;

  const renderTurn = (role: "user" | "assistant", text: string): HTMLElement => {
    const turn = document.createElement("div");
    turn.className = `terax-explain-turn terax-explain-${role}`;
    turn.textContent = text;
    dom.body.appendChild(turn);
    dom.body.scrollTop = dom.body.scrollHeight;
    return turn;
  };

  const setBusy = (b: boolean) => {
    busy = b;
    dom.input.disabled = b;
    dom.sendBtn.disabled = b;
    dom.sendBtn.textContent = b ? "…" : "Ask";
  };

  const sendQuestion = async (question?: string) => {
    if (busy) return;
    const isFirst = history.length === 0;
    if (!isFirst) {
      if (!question || !question.trim()) return;
      history.push({ role: "user", content: question.trim() });
      renderTurn("user", question.trim());
      dom.input.value = "";
    }
    setBusy(true);
    const assistantNode = renderTurn("assistant", "");
    let acc = "";

    try {
      const stream = await streamExplain(ctx, history);
      currentAbort = stream.abort;
      for await (const chunk of stream.textStream) {
        if (disposed) {
          stream.abort();
          return;
        }
        acc += chunk;
        assistantNode.textContent = acc;
        dom.body.scrollTop = dom.body.scrollHeight;
        updateZone();
      }
      const final = await stream.finalText;
      acc = final || acc;
      assistantNode.textContent = acc;
      history.push({ role: "assistant", content: acc });
    } catch (err) {
      assistantNode.textContent =
        acc + `\n\n[error: ${(err as Error)?.message ?? "request failed"}]`;
      assistantNode.classList.add("terax-explain-error");
    } finally {
      currentAbort = null;
      setBusy(false);
      updateZone();
      dom.input.focus();
    }
  };

  dom.sendBtn.addEventListener("click", () => {
    void sendQuestion(dom.input.value);
  });
  dom.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion(dom.input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dispose();
    }
  });
  dom.closeBtn.addEventListener("click", () => dispose());

  // Stop Monaco from eating these keys when focus is in our input.
  for (const evt of ["keydown", "keyup", "keypress"] as const) {
    dom.input.addEventListener(evt, (e) => e.stopPropagation());
  }

  // Kick off the initial explanation.
  void sendQuestion();

  function dispose() {
    if (disposed) return;
    disposed = true;
    currentAbort?.();
    editor.changeViewZones((acc) => {
      if (viewZoneId !== null) acc.removeZone(viewZoneId);
    });
    dom.root.remove();
  }

  return dispose;
}

type WidgetDom = {
  root: HTMLDivElement;
  body: HTMLDivElement;
  input: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
};

function buildWidgetDom(): WidgetDom {
  ensureStyles();
  const root = document.createElement("div");
  root.className = "terax-explain-root";

  const header = document.createElement("div");
  header.className = "terax-explain-header";
  const title = document.createElement("div");
  title.className = "terax-explain-title";
  title.textContent = "Explain";
  const closeBtn = document.createElement("button");
  closeBtn.className = "terax-explain-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.title = "Close (Esc)";
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "terax-explain-body";

  const inputRow = document.createElement("div");
  inputRow.className = "terax-explain-input-row";
  const input = document.createElement("textarea");
  input.className = "terax-explain-input";
  input.rows = 1;
  input.placeholder = "Ask a follow-up… (Enter to send, Esc to close)";
  const sendBtn = document.createElement("button");
  sendBtn.className = "terax-explain-send";
  sendBtn.type = "button";
  sendBtn.textContent = "Ask";
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  root.appendChild(header);
  root.appendChild(body);
  root.appendChild(inputRow);
  return { root, body, input, sendBtn, closeBtn };
}

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.terax-explain-root {
  margin: 6px 12px 6px 64px;
  border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.12));
  background: var(--vscode-editorWidget-background, rgba(30,30,38,0.96));
  color: var(--vscode-editorWidget-foreground, #e6e6e6);
  border-radius: 8px;
  font-family: "Inter", system-ui, sans-serif;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  overflow: hidden;
}
.terax-explain-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.terax-explain-title {
  font-weight: 600; letter-spacing: 0.02em; font-size: 11px; text-transform: uppercase;
  opacity: 0.7;
}
.terax-explain-close {
  background: transparent; border: 0; color: inherit; cursor: pointer;
  font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 4px;
}
.terax-explain-close:hover { background: rgba(255,255,255,0.08); }
.terax-explain-body {
  padding: 8px 12px; max-height: 240px; overflow: auto;
  display: flex; flex-direction: column; gap: 8px;
  font-family: "Inter", system-ui, sans-serif;
}
.terax-explain-turn {
  white-space: pre-wrap; word-break: break-word; line-height: 1.45;
}
.terax-explain-user {
  align-self: flex-end;
  background: rgba(120, 160, 255, 0.12);
  padding: 6px 10px; border-radius: 8px; max-width: 85%;
}
.terax-explain-assistant {
  align-self: flex-start;
  max-width: 100%;
}
.terax-explain-error { color: #ff8a8a; }
.terax-explain-input-row {
  display: flex; gap: 6px; padding: 6px 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(0,0,0,0.15);
}
.terax-explain-input {
  flex: 1; resize: none; border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.25); color: inherit; border-radius: 6px;
  padding: 6px 8px; font: inherit; outline: none;
  font-family: "Inter", system-ui, sans-serif;
}
.terax-explain-input:focus { border-color: rgba(120,160,255,0.55); }
.terax-explain-send {
  background: rgba(120,160,255,0.18); color: #cfe0ff;
  border: 1px solid rgba(120,160,255,0.35);
  border-radius: 6px; padding: 0 12px; cursor: pointer; font: inherit;
}
.terax-explain-send:hover:not(:disabled) { background: rgba(120,160,255,0.28); }
.terax-explain-send:disabled { opacity: 0.6; cursor: default; }
`;
  document.head.appendChild(style);
}
