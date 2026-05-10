import type * as MonacoNs from "monaco-editor";
import { BugScanner, type BugReport } from "@/modules/ai/lib/bugScanner";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { getModel } from "@/modules/ai/config";

const MARKER_OWNER = "terax-ai-bugs";
const SCAN_DEBOUNCE_MS = 60_000;
const POST_KEYSTROKE_QUIET_MS = 3_000;

type Editor = MonacoNs.editor.IStandaloneCodeEditor;

/**
 * Owns the bug-scan loop for a single Monaco editor instance.
 *
 * Trigger model: scan fires `SCAN_DEBOUNCE_MS` (60s) after the most recent
 * keystroke, only if the file actually changed since the last sent snapshot.
 * If the user is mid-typing (last keystroke <3s ago), wait until they pause.
 */
export class BugScannerController {
  private scanner: BugScanner;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastChangeAt = 0;
  private active = false;
  private disposed = false;
  private bugs: BugReport[] = [];

  constructor(
    private readonly editor: Editor,
    private readonly monaco: typeof MonacoNs,
    path: string,
  ) {
    const model = editor.getModel();
    const language = model?.getLanguageId() ?? "plaintext";
    this.scanner = new BugScanner(path, language);
  }

  /** Turn the scanner on. Schedules the first scan after a short warm-up. */
  start(): void {
    if (this.disposed || this.active) return;
    if (!this.hasUsableModelKey()) return;
    this.active = true;
    this.lastChangeAt = Date.now();
    // First scan after 5s so opening a file isn't silent.
    this.scheduleIn(5_000);
  }

  /** Turn the scanner off and clear all AI markers. */
  stop(): void {
    this.active = false;
    this.scanner.abort();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.bugs = [];
    this.applyMarkers();
  }

  /** External signal that the file content changed. */
  notifyChanged(): void {
    if (!this.active) return;
    this.lastChangeAt = Date.now();
    this.scheduleIn(SCAN_DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private scheduleIn(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.maybeRunScan();
    }, ms);
  }

  private async maybeRunScan() {
    if (!this.active || this.disposed) return;
    const sinceKeystroke = Date.now() - this.lastChangeAt;
    if (sinceKeystroke < POST_KEYSTROKE_QUIET_MS) {
      // User is still typing — postpone.
      this.scheduleIn(POST_KEYSTROKE_QUIET_MS - sinceKeystroke + 100);
      return;
    }

    const model = this.editor.getModel();
    if (!model) return;
    const content = model.getValue();
    if (!this.scanner.hasChange(content)) {
      // Nothing new — sleep a full window before checking again.
      this.scheduleIn(SCAN_DEBOUNCE_MS);
      return;
    }

    if (!this.hasUsableModelKey()) {
      this.scheduleIn(SCAN_DEBOUNCE_MS);
      return;
    }

    const outcome = await this.scanner.scan(content);
    if (this.disposed || !this.active) return;
    if (outcome.ok) {
      this.bugs = outcome.bugs;
      this.applyMarkers();
    }
    // Reschedule another check after the debounce window regardless of result.
    this.scheduleIn(SCAN_DEBOUNCE_MS);
  }

  private applyMarkers() {
    const model = this.editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();
    const markers: MonacoNs.editor.IMarkerData[] = this.bugs.map((bug) => {
      const startLine = clamp(bug.startLine, 1, lineCount);
      const endLine = clamp(bug.endLine, startLine, lineCount);
      const endColumn = model.getLineMaxColumn(endLine);
      const message = bug.suggestion
        ? `${bug.title}\n\n${bug.explanation}\n\nSuggestion: ${bug.suggestion}\n\n— Terax AI`
        : `${bug.title}\n\n${bug.explanation}\n\n— Terax AI`;
      return {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn,
        message,
        severity: severityFor(this.monaco, bug.severity),
        source: "Terax AI",
      };
    });
    this.monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }

  private hasUsableModelKey(): boolean {
    const { selectedModelId, apiKeys } = useChatStore.getState();
    const m = getModel(selectedModelId);
    if (m.provider === "lmstudio" || m.provider === "ollama") return true;
    return !!apiKeys[m.provider];
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function severityFor(
  monaco: typeof MonacoNs,
  s: BugReport["severity"],
): MonacoNs.MarkerSeverity {
  if (s === "critical") return monaco.MarkerSeverity.Error;
  if (s === "warning") return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
}
