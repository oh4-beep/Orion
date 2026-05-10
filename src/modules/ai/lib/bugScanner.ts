import { generateText, type ModelMessage } from "ai";
import { buildLanguageModel } from "./agent";
import { getModel } from "../config";
import { useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

export type BugSeverity = "critical" | "warning" | "info";

export type BugReport = {
  startLine: number;
  endLine: number;
  severity: BugSeverity;
  title: string;
  explanation: string;
  suggestion?: string;
};

const SCANNER_SYSTEM_PROMPT = `You are a code bug detector. You watch a single file as the user edits it and report likely bugs.

What counts as a bug:
- Logic errors (wrong condition, off-by-one, wrong loop bound, wrong default).
- Misuse of an API or data structure (e.g. iterating a Map like an array, awaiting a non-promise).
- Null/undefined access that the surrounding code doesn't guard.
- State that is read but never updated, or updated but never read in a way that matters.
- Concurrency / async ordering mistakes (missing await, race condition).
- Resource leaks (unclosed handles, missing cleanup).
- Edge cases the code clearly forgets (empty input, single-element input, negative numbers).

What does NOT count — never report these:
- Style, formatting, naming, missing comments, unused imports.
- "Could be more idiomatic", "consider using X instead".
- Type-only issues a TypeScript compiler would already flag.
- Speculative / low-confidence concerns.

Strict output rules:
- Respond with ONLY a JSON object of the form: {"bugs": [...]}. No prose, no fences, no commentary.
- Each bug has: startLine (1-based), endLine (1-based, inclusive), severity ("critical" | "warning" | "info"), title (<=100 chars), explanation (1-3 sentences, plain English), suggestion (optional, <=200 chars).
- "critical" = the code will malfunction or crash on a realistic input.
- "warning" = likely bug but situational.
- "info" = a real correctness concern worth surfacing but not certain.
- If there are no bugs, return {"bugs": []}.
- A bug spans the smallest meaningful range — usually 1 line, sometimes a function. Don't report the whole file.

You will be given a file once, then updates as unified diffs. Re-evaluate every report each turn — drop reports that the latest edit fixed, keep ones still valid, add new ones. Always return the FULL current set, not a delta.`;

const MAX_LCS_CELLS = 4_000_000;
const RESEED_AFTER_TURNS = 8;
const RESEED_DIFF_RATIO = 0.4;

function buildSeedPrompt(path: string, language: string, content: string): string {
  const numbered = numberLines(content);
  return [
    `File: ${path}`,
    `Language: ${language || "unknown"}`,
    "",
    "Initial contents (line-numbered):",
    "```",
    numbered,
    "```",
    "",
    "Report any bugs as JSON.",
  ].join("\n");
}

function buildDiffPrompt(
  path: string,
  diff: string,
  newContent: string,
): string {
  return [
    `File: ${path} — updated.`,
    "",
    "Unified diff (lines starting with '-' are removed, '+' are added, ' ' are unchanged):",
    "```",
    diff,
    "```",
    "",
    "Current full file (line-numbered) for reference:",
    "```",
    numberLines(newContent),
    "```",
    "",
    "Re-report ALL current bugs as JSON.",
  ].join("\n");
}

function numberLines(s: string): string {
  const lines = s.split("\n");
  const width = String(lines.length).length;
  return lines
    .map((l, i) => `${String(i + 1).padStart(width, " ")} | ${l}`)
    .join("\n");
}

/**
 * Naive LCS-based line diff. Output format is a unified diff body (no header):
 * each line is prefixed with " ", "-" or "+". Returns null if the file is too
 * large for the LCS table — caller should re-seed instead.
 */
export function lineDiff(oldText: string, newText: string): string | null {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;
  if (m * n > MAX_LCS_CELLS) return null;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      out.push(` ${oldLines[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${oldLines[i]}`);
      i++;
    } else {
      out.push(`+${newLines[j]}`);
      j++;
    }
  }
  while (i < m) out.push(`-${oldLines[i++]}`);
  while (j < n) out.push(`+${newLines[j++]}`);
  return out.join("\n");
}

function diffSize(diff: string): number {
  let n = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") || line.startsWith("-")) n++;
  }
  return n;
}

function tryParseBugs(raw: string): BugReport[] | null {
  let text = raw.trim();
  // Strip ```json fences.
  const fence = text.match(/^```[a-zA-Z0-9_-]*\n?([\s\S]*?)\n?```\s*$/);
  if (fence) text = fence[1].trim();
  // Salvage: take the first {...} block.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const json = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const bugs = (parsed as { bugs?: unknown }).bugs;
  if (!Array.isArray(bugs)) return null;

  const out: BugReport[] = [];
  for (const item of bugs) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const startLine = toInt(r.startLine);
    const endLine = toInt(r.endLine ?? r.startLine);
    if (startLine == null || endLine == null) continue;
    const severity =
      r.severity === "critical" || r.severity === "warning" || r.severity === "info"
        ? (r.severity as BugSeverity)
        : "warning";
    const title = typeof r.title === "string" ? r.title.slice(0, 200) : "Possible issue";
    const explanation =
      typeof r.explanation === "string" ? r.explanation : title;
    const suggestion =
      typeof r.suggestion === "string" && r.suggestion.trim().length > 0
        ? r.suggestion.slice(0, 400)
        : undefined;
    out.push({
      startLine: Math.max(1, startLine),
      endLine: Math.max(startLine, endLine),
      severity,
      title,
      explanation,
      suggestion,
    });
  }
  return out;
}

function toInt(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return Math.floor(x);
  if (typeof x === "string") {
    const n = Number.parseInt(x, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type ScanOutcome =
  | { ok: true; bugs: BugReport[]; reseeded: boolean }
  | { ok: false; reason: string };

/**
 * Stateful per-file bug scanner. Reuses the same conversation across scans,
 * sending the full file the first time and unified diffs after that. Re-seeds
 * when the diff is too large or the conversation is too long.
 */
export class BugScanner {
  private messages: ModelMessage[] = [];
  private lastSentSnapshot = "";
  private lastSentSize = 0;
  private turns = 0;
  private inFlight: AbortController | null = null;

  constructor(
    private readonly path: string,
    private readonly language: string,
  ) {}

  /** True if the current content differs from what was last sent. */
  hasChange(currentContent: string): boolean {
    return this.messages.length === 0 || currentContent !== this.lastSentSnapshot;
  }

  /** Reset the conversation. Next scan() will re-seed. */
  reset(): void {
    this.messages = [];
    this.lastSentSnapshot = "";
    this.lastSentSize = 0;
    this.turns = 0;
    this.abort();
  }

  abort(): void {
    this.inFlight?.abort();
    this.inFlight = null;
  }

  async scan(currentContent: string): Promise<ScanOutcome> {
    if (!this.hasChange(currentContent)) {
      return { ok: true, bugs: [], reseeded: false };
    }
    this.abort();

    const isSeed = this.messages.length === 0;
    let userMessage: string;
    let reseeded = false;

    if (isSeed) {
      userMessage = buildSeedPrompt(this.path, this.language, currentContent);
      this.messages = [];
      this.turns = 0;
      reseeded = true;
    } else {
      const diff = lineDiff(this.lastSentSnapshot, currentContent);
      const diffLines = diff == null ? Number.POSITIVE_INFINITY : diffSize(diff);
      const ratio =
        this.lastSentSize === 0 ? 1 : diffLines / this.lastSentSize;
      const shouldReseed =
        diff == null ||
        ratio > RESEED_DIFF_RATIO ||
        this.turns >= RESEED_AFTER_TURNS;
      if (shouldReseed) {
        userMessage = buildSeedPrompt(this.path, this.language, currentContent);
        this.messages = [];
        this.turns = 0;
        reseeded = true;
      } else {
        userMessage = buildDiffPrompt(this.path, diff, currentContent);
      }
    }

    const { selectedModelId, apiKeys } = useChatStore.getState();
    const prefs = usePreferencesStore.getState();
    const m = getModel(selectedModelId);
    const model = await buildLanguageModel(m.provider, apiKeys, m.id, {
      lmstudioBaseURL: prefs.lmstudioBaseURL,
      ollamaBaseURL: prefs.ollamaBaseURL,
    });

    const ctrl = new AbortController();
    this.inFlight = ctrl;

    const messages: ModelMessage[] = [
      ...this.messages,
      { role: "user", content: userMessage },
    ];

    let raw: string;
    try {
      const res = await generateText({
        model,
        system: SCANNER_SYSTEM_PROMPT,
        messages,
        abortSignal: ctrl.signal,
        temperature: 0,
        maxRetries: 0,
      });
      raw = res.text;
    } catch (err) {
      this.inFlight = null;
      if ((err as { name?: string })?.name === "AbortError") {
        return { ok: false, reason: "aborted" };
      }
      return { ok: false, reason: (err as Error)?.message ?? "request failed" };
    }
    this.inFlight = null;

    const bugs = tryParseBugs(raw);
    if (!bugs) {
      // Don't poison the conversation with an unparseable assistant turn.
      return { ok: false, reason: "parse failed" };
    }

    this.messages = [
      ...messages,
      { role: "assistant", content: JSON.stringify({ bugs }) },
    ];
    this.lastSentSnapshot = currentContent;
    this.lastSentSize = currentContent.split("\n").length;
    this.turns += 1;

    return { ok: true, bugs, reseeded };
  }
}
