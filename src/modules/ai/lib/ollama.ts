import { invoke } from "@tauri-apps/api/core";
import { OLLAMA_DEFAULT_BASE_URL } from "../config";

export type OllamaModel = {
  /** Tag-qualified model name, e.g. `llama3.2:latest`, `qwen2.5-coder:7b`. */
  name: string;
  /** Human-readable size column from `ollama list`, e.g. "4.7 GB". */
  size: string;
  /** Modified column ("3 days ago"). */
  modified: string;
};

type ShellResult = {
  stdout: string;
  stderr: string;
  code: number;
  truncated: boolean;
};

function nativeURL(baseURL: string): string {
  // Convert the OpenAI-compat URL (`/v1`) to the native Ollama root URL.
  return baseURL.replace(/\/v1\/?$/, "");
}

/** Ping the Ollama daemon. Resolves true when /api/tags responds. */
export async function isOllamaRunning(
  baseURL: string = OLLAMA_DEFAULT_BASE_URL,
): Promise<boolean> {
  try {
    const res = await fetch(`${nativeURL(baseURL)}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Whether the `ollama` CLI is installed on PATH. */
export async function isOllamaInstalled(): Promise<boolean> {
  try {
    const res = await invoke<ShellResult>("shell_run_command", {
      command: "command -v ollama",
      timeoutSecs: 5,
    });
    return res.code === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * List installed Ollama models. Tries the HTTP API first (no shell roundtrip);
 * falls back to parsing `ollama list` if the daemon isn't up.
 */
export async function listOllamaModels(
  baseURL: string = OLLAMA_DEFAULT_BASE_URL,
): Promise<OllamaModel[]> {
  // HTTP path — fastest when the daemon is running.
  try {
    const res = await fetch(`${nativeURL(baseURL)}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        models?: Array<{ name: string; size?: number; modified_at?: string }>;
      };
      return (json.models ?? []).map((m) => ({
        name: m.name,
        size: typeof m.size === "number" ? humanSize(m.size) : "",
        modified: m.modified_at ? humanAgo(m.modified_at) : "",
      }));
    }
  } catch {
    // fall through to CLI
  }

  // CLI fallback — useful on first launch before the daemon is started.
  try {
    const res = await invoke<ShellResult>("shell_run_command", {
      command: "ollama list",
      timeoutSecs: 10,
    });
    if (res.code !== 0) return [];
    return parseOllamaListTable(res.stdout);
  } catch {
    return [];
  }
}

/**
 * Make sure the daemon is reachable. If not, spawn `ollama serve` in the
 * background and poll until /api/tags responds (up to ~10s). Returns true
 * when the daemon is up.
 */
export async function ensureOllamaRunning(
  baseURL: string = OLLAMA_DEFAULT_BASE_URL,
): Promise<boolean> {
  if (await isOllamaRunning(baseURL)) return true;
  if (!(await isOllamaInstalled())) return false;

  // Spawn detached. Errors are swallowed — we'll know via the poll loop.
  try {
    await invoke<number>("shell_bg_spawn", { command: "ollama serve" });
  } catch {
    // ignore — maybe already running on another port
  }

  // Poll for readiness.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await isOllamaRunning(baseURL)) return true;
    await sleep(400);
  }
  return false;
}

/**
 * Pull a model in the background. Returns the bg-process handle so the caller
 * can poll logs / kill it. The download streams progress to stdout.
 */
export async function pullOllamaModel(name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("model name is empty");
  return invoke<number>("shell_bg_spawn", {
    command: `ollama pull ${shellQuote(trimmed)}`,
  });
}

function parseOllamaListTable(text: string): OllamaModel[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  // Header: "NAME  ID  SIZE  MODIFIED" — split on 2+ spaces.
  const out: OllamaModel[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/\s{2,}/);
    if (cols.length < 4) continue;
    out.push({
      name: cols[0],
      // cols[1] is the model ID hash, skip it
      size: cols[2],
      modified: cols[3],
    });
  }
  return out;
}

function humanSize(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

function humanAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shellQuote(s: string): string {
  // Single-quote and escape any embedded single quotes — matches POSIX rules.
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
