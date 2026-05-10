import { streamText, type ModelMessage } from "ai";
import { buildLanguageModel } from "./agent";
import { getModel } from "../config";
import { useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

const SYSTEM_PROMPT = `You explain code to a developer in plain English.

Rules:
- Explain only the highlighted line(s). Surrounding code is shown for context but is NOT what the user asked about.
- Be concise — 1 to 3 short sentences for the first answer. No bullet lists unless the user asks.
- Don't restate the code verbatim. Describe what it does and why, not what it says token by token.
- If something is unclear or non-obvious (a subtle bug, a side effect, a non-trivial dependency), call it out.
- For follow-up questions, stay focused on the same code. Match the question's depth.
- No greetings, no sign-offs, no "this code...". Just the explanation.`;

export type ExplainContext = {
  /** Absolute or workspace-relative file path (used to give the model a hint). */
  path: string;
  /** Full target text the user asked about (one line, or a multi-line selection). */
  target: string;
  /** 1-based start line number of the target in the file. */
  targetStartLine: number;
  /** Up to ~10 lines before the target, for context. */
  before: string;
  /** Up to ~10 lines after the target, for context. */
  after: string;
  /** Language id (e.g. "typescript") — purely a hint for the model. */
  language: string;
};

export type ExplainTurn = {
  role: "user" | "assistant";
  content: string;
};

function buildSeedUserMessage(ctx: ExplainContext): string {
  const lang = ctx.language || "text";
  return [
    `File: ${ctx.path}`,
    `Language: ${lang}`,
    "",
    "Context (lines before):",
    "```" + lang,
    ctx.before || "(none)",
    "```",
    "",
    `Highlighted line(s) (starting at line ${ctx.targetStartLine}) — explain THIS:`,
    "```" + lang,
    ctx.target,
    "```",
    "",
    "Context (lines after):",
    "```" + lang,
    ctx.after || "(none)",
    "```",
  ].join("\n");
}

function buildModelMessages(
  ctx: ExplainContext,
  history: ExplainTurn[],
): ModelMessage[] {
  const seed: ModelMessage = {
    role: "user",
    content: buildSeedUserMessage(ctx),
  };
  const rest: ModelMessage[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));
  return [seed, ...rest];
}

export type ExplainStream = {
  /** Async iterator over text chunks. */
  textStream: AsyncIterable<string>;
  /** Promise resolving to the final, full text once streaming finishes. */
  finalText: Promise<string>;
  /** Cancel the in-flight request. */
  abort: () => void;
};

/**
 * Stream an explanation for the given anchor. `history` is the prior turns
 * for follow-ups (excluding the seed message — that's rebuilt every time so
 * it always reflects the *current* surrounding code).
 *
 * Returns an iterator over text chunks; consume it to render tokens live.
 */
export async function streamExplain(
  ctx: ExplainContext,
  history: ExplainTurn[],
): Promise<ExplainStream> {
  const { selectedModelId, apiKeys } = useChatStore.getState();
  const prefs = usePreferencesStore.getState();
  const m = getModel(selectedModelId);
  const model = await buildLanguageModel(m.provider, apiKeys, m.id, {
    lmstudioBaseURL: prefs.lmstudioBaseURL,
    ollamaBaseURL: prefs.ollamaBaseURL,
  });

  const controller = new AbortController();
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: buildModelMessages(ctx, history),
    abortSignal: controller.signal,
    temperature: 0.3,
    maxRetries: 1,
  });

  return {
    textStream: result.textStream,
    finalText: Promise.resolve(result.text),
    abort: () => controller.abort(),
  };
}
