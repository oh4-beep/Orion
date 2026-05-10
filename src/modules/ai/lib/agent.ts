import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getModel,
  LMSTUDIO_DEFAULT_BASE_URL,
  MAX_AGENT_STEPS,
  OLLAMA_DEFAULT_BASE_URL,
  providerNeedsKey,
  SYSTEM_PROMPT,
  type ModelId,
  type ProviderId,
} from "../config";
import type { ProviderKeys } from "./keyring";
import { buildTools, type ToolContext } from "../tools/tools";

type AgentDeps = {
  keys: ProviderKeys;
  modelId?: ModelId;
  customInstructions?: string;
  /** Persona / role for this conversation (system prompt addendum). */
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
  /** Override base URL for OpenAI-compatible providers (LM Studio). */
  lmstudioBaseURL?: string;
  /** Override base URL for Ollama's OpenAI-compatible endpoint. */
  ollamaBaseURL?: string;
  /** Override actual model name when chat is set to "ollama-local". */
  ollamaChatModel?: string;
  /** True when /plan is active — agent should batch edits for review. */
  planMode?: boolean;
  /** Contents of TERAX.md at workspace root, if present. Appended verbatim. */
  projectMemory?: string | null;
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (i) => `Reading ${shortPath(i.path)}`,
  list_directory: (i) => `Listing ${shortPath(i.path)}`,
  grep: (i) => `Grepping ${ellipsize(String(i.pattern ?? ""), 40)}`,
  glob: (i) => `Globbing ${ellipsize(String(i.pattern ?? ""), 40)}`,
  edit: (i) => `Editing ${shortPath(i.path)}`,
  multi_edit: (i) => `Editing ${shortPath(i.path)}`,
  write_file: (i) => `Writing ${shortPath(i.path)}`,
  create_directory: (i) => `Creating ${shortPath(i.path)}`,
  bash_run: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_background: (i) =>
    `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_logs: () => `Reading logs`,
  bash_list: () => `Listing background processes`,
  bash_kill: () => `Stopping background process`,
  suggest_command: (i) =>
    `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
  todo_write: (i) =>
    `Updating plan (${Array.isArray(i.todos) ? i.todos.length : 0} items)`,
  run_subagent: (i) => `Spawning ${String(i.type ?? "subagent")} subagent`,
};

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type BuildModelOptions = {
  /** Override the model id (used by autocomplete with custom LM Studio model). */
  modelIdOverride?: string;
  /** Override LM Studio base URL. Defaults to `LMSTUDIO_DEFAULT_BASE_URL`. */
  lmstudioBaseURL?: string;
  /** Override Ollama base URL. Defaults to `OLLAMA_DEFAULT_BASE_URL`. */
  ollamaBaseURL?: string;
};

// Memoize built models. Provider clients are not free to construct — they
// register middleware and parse keys — and we'd otherwise rebuild one per
// `sendMessages` call. Keyed on the full identity that affects the result.
const modelCache = new Map<string, LanguageModel>();

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (providerNeedsKey(provider) && !keys[provider]) {
    throw new Error(
      `No API key configured for ${provider}. Open Settings → AI to add one.`,
    );
  }
  const key = keys[provider] ?? "";
  const baseURL = options.lmstudioBaseURL ?? LMSTUDIO_DEFAULT_BASE_URL;
  const ollamaURL = options.ollamaBaseURL ?? OLLAMA_DEFAULT_BASE_URL;
  const cacheKey = `${provider}|${key}|${resolvedModelId}|${baseURL}|${ollamaURL}`;
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  let built: LanguageModel;
  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      built = createOpenAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      built = createAnthropic({ apiKey: key })(resolvedModelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      built = createGoogleGenerativeAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      built = createXai({ apiKey: key })(resolvedModelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      built = createCerebras({ apiKey: key })(resolvedModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: key })(resolvedModelId);
      break;
    }
    case "lmstudio": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      built = createOpenAICompatible({ name: "lmstudio", baseURL })(
        resolvedModelId,
      );
      break;
    }
    case "ollama": {
      // Use the native Ollama provider (talks to /api/chat) instead of the
      // OpenAI-compat shim. Native tool-calling round-trips properly here;
      // the compat shim caused tool-capable models to emit raw JSON instead
      // of structured tool_calls.
      const { createOllama } = await import("ollama-ai-provider-v2");
      // ollama-ai-provider-v2 expects the baseURL to point at the Ollama
      // native API root (`/api`). Our setting stores the OpenAI-compat URL
      // (`…/v1`); strip `/v1` and append `/api`.
      const root = ollamaURL.replace(/\/v1\/?$/, "").replace(/\/$/, "");
      const nativeURL = `${root}/api`;
      built = createOllama({ baseURL: nativeURL })(resolvedModelId);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive as ProviderId}`);
    }
  }
  modelCache.set(cacheKey, built);
  return built;
}

function buildModel(
  modelId: ModelId,
  keys: ProviderKeys,
  lmstudioBaseURL?: string,
  ollamaBaseURL?: string,
  ollamaChatModel?: string,
): Promise<LanguageModel> {
  const m = getModel(modelId);
  // For the local-Ollama sentinel, the actual model name comes from a
  // separate preference (the user picks one of their installed models).
  const resolved =
    m.provider === "ollama" && ollamaChatModel?.trim()
      ? ollamaChatModel.trim()
      : m.id;
  return buildLanguageModel(m.provider, keys, resolved, {
    lmstudioBaseURL,
    ollamaBaseURL,
  });
}

export async function createTeraxAgent({
  keys,
  modelId = DEFAULT_MODEL_ID,
  customInstructions,
  agentPersona,
  toolContext,
  onStep,
  lmstudioBaseURL,
  ollamaBaseURL,
  ollamaChatModel,
  planMode,
  projectMemory,
}: AgentDeps) {
  const trimmedCustom = customInstructions?.trim();
  const personaBlock = agentPersona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${agentPersona.name}\n${agentPersona.instructions.trim()}`
    : "";
  const customBlock = trimmedCustom
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${trimmedCustom}`
    : "";
  const memoryBlock =
    projectMemory && projectMemory.trim().length > 0
      ? `\n\n## PROJECT — TERAX.md\n${projectMemory.trim()}`
      : "";
  const planBlock = planMode
    ? `\n\n## PLAN MODE — ACTIVE\nMutating tools (write_file, edit, multi_edit, create_directory) will queue their changes for the user to review as a single diff. Do NOT execute bash_run or bash_background while plan mode is active — restrict yourself to reads (read_file, grep, glob, list_directory) and the queued mutations. After queueing the full set of edits, stop and return a brief summary; do not continue acting until the user has accepted/rejected.`
    : "";
  const instructions = `${SYSTEM_PROMPT}${memoryBlock}${personaBlock}${customBlock}${planBlock}`;
  const model = await buildModel(
    modelId,
    keys,
    lmstudioBaseURL,
    ollamaBaseURL,
    ollamaChatModel,
  );
  return new Agent({
    model,
    instructions,
    tools: buildTools(toolContext),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) {
        const label = TOOL_LABELS[last.toolName];
        onStep(
          label
            ? label((last.input ?? {}) as Record<string, unknown>)
            : `Calling ${last.toolName}`,
        );
      } else if (step.text) {
        onStep("Writing");
      }
    },
    onFinish: () => {
      onStep?.(null);
    },
  });
}

export type TeraxAgent = Awaited<ReturnType<typeof createTeraxAgent>>;

export function createTeraxTransport(agent: TeraxAgent) {
  return new DirectChatTransport({ agent });
}
