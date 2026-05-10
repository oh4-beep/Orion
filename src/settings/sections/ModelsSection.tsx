import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AUTOCOMPLETE_PROVIDERS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  MODELS,
  PROVIDERS,
  getModel,
  getProvider,
  providerNeedsKey,
  type AutocompleteProviderId,
  type ModelId,
  type ProviderId,
} from "@/modules/ai/config";
import { clearKey, getAllKeys, setKey } from "@/modules/ai/lib/keyring";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  emitKeysChanged,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setDefaultModel,
  setLmstudioBaseURL,
  setOllamaBaseURL,
} from "@/modules/settings/store";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";

type KeysMap = Record<ProviderId, string | null>;

export function ModelsSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);

  useEffect(() => {
    void getAllKeys().then(setKeys);
  }, []);

  const onSave = async (provider: ProviderId, value: string) => {
    await setKey(provider, value);
    setKeys((prev) => (prev ? { ...prev, [provider]: value } : prev));
    await emitKeysChanged();
  };

  const onClear = async (provider: ProviderId) => {
    await clearKey(provider);
    setKeys((prev) => (prev ? { ...prev, [provider]: null } : prev));
    await emitKeysChanged();
  };

  if (!keys) {
    return <div className="text-[12px] text-muted-foreground">Loading…</div>;
  }

  const defaultModelInfo = getModel(defaultModel);
  const configuredCount = PROVIDERS.filter(
    (p) => providerNeedsKey(p.id) && !!keys[p.id],
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Bring your own keys. They live in your OS keychain and are used only by Terax."
      />

      <div className="flex flex-col gap-2">
        <Label>Default model</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon provider={defaultModelInfo.provider} size={14} />
                <span>{defaultModelInfo.label}</span>
                <span className="text-muted-foreground">
                  · {defaultModelInfo.hint}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="opacity-70"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((m) => m.provider === p.id);
              if (models.length === 0) return null;
              const hasKey = providerNeedsKey(p.id) ? !!keys[p.id] : true;
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey && (
                      <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                        no key
                      </span>
                    )}
                  </div>
                  {models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      disabled={!hasKey}
                      onSelect={() =>
                        hasKey && void setDefaultModel(m.id as ModelId)
                      }
                      className={cn(
                        "flex items-center justify-between gap-2 text-[12px]",
                        m.id === defaultModel && "bg-accent/50",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>API keys</Label>
          <span className="text-[10.5px] text-muted-foreground">
            {configuredCount} of {PROVIDERS.filter((p) => providerNeedsKey(p.id)).length} configured
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.filter((p) => providerNeedsKey(p.id)).map((p) => (
            <ProviderKeyCard
              key={p.id}
              provider={p}
              currentKey={keys[p.id]}
              onSave={(v: string) => onSave(p.id, v)}
              onClear={() => onClear(p.id)}
            />
          ))}
        </div>
      </div>

      <OllamaBlock />

      <AutocompleteBlock keys={keys} />
    </div>
  );
}

function OllamaBlock() {
  const baseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const chatModel = usePreferencesStore((s) => s.ollamaChatModel);
  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [models, setModels] = useState<
    { name: string; size: string; modified: string }[]
  >([]);
  const [status, setStatus] = useState<
    "unknown" | "running" | "stopped" | "starting" | "missing"
  >("unknown");
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState<{
    handle: number;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setUrlDraft(baseURL), [baseURL]);

  const refresh = async () => {
    const { isOllamaRunning, isOllamaInstalled, listOllamaModels } =
      await import("@/modules/ai/lib/ollama");
    const installed = await isOllamaInstalled();
    if (!installed) {
      setStatus("missing");
      setModels([]);
      return;
    }
    const running = await isOllamaRunning(baseURL);
    setStatus(running ? "running" : "stopped");
    if (running) setModels(await listOllamaModels(baseURL));
    else setModels([]);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseURL]);

  const start = async () => {
    setBusy(true);
    setStatus("starting");
    try {
      const { ensureOllamaRunning } = await import("@/modules/ai/lib/ollama");
      const ok = await ensureOllamaRunning(baseURL);
      setStatus(ok ? "running" : "stopped");
      if (ok) {
        const { listOllamaModels } = await import("@/modules/ai/lib/ollama");
        setModels(await listOllamaModels(baseURL));
      }
    } finally {
      setBusy(false);
    }
  };

  const pull = async () => {
    const name = pullName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { pullOllamaModel } = await import("@/modules/ai/lib/ollama");
      const handle = await pullOllamaModel(name);
      setPulling({ handle, name });
      setPullName("");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  // Poll the pull job until it exits, then refresh the model list.
  useEffect(() => {
    if (!pulling) return;
    let cancelled = false;
    let offset = 0;
    const tick = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = await invoke<{
          exited: boolean;
          next_offset: number;
        }>("shell_bg_logs", { handle: pulling.handle, since: offset });
        offset = r.next_offset;
        if (r.exited) {
          if (!cancelled) {
            setPulling(null);
            void refresh();
          }
          return;
        }
      } catch {
        // ignore — try again
      }
      if (!cancelled) setTimeout(() => void tick(), 1500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulling]);

  const dot = (() => {
    switch (status) {
      case "running":
        return "bg-emerald-500";
      case "starting":
        return "bg-amber-500 animate-pulse";
      case "missing":
      case "stopped":
        return "bg-rose-500";
      default:
        return "bg-muted-foreground/40";
    }
  })();

  const statusText = (() => {
    switch (status) {
      case "running":
        return "Daemon running";
      case "starting":
        return "Starting…";
      case "stopped":
        return "Daemon not running";
      case "missing":
        return "Not installed — `brew install ollama`";
      default:
        return "Checking…";
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label>Ollama (local models)</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Run open-source models locally — code, design, chat. Detected
            from your installed models. The daemon auto-starts when you pick
            an Ollama model.
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", dot)} />
          <span>{statusText}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Base URL</Label>
          <div className="flex gap-1.5">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => {
                const v = urlDraft.trim();
                if (v && v !== baseURL) {
                  void import("@/modules/settings/store").then((m) =>
                    m.setOllamaBaseURL(v),
                  );
                }
              }}
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void start()}
              disabled={busy || status === "running"}
              className="h-8 px-2.5 text-[11px]"
            >
              {status === "running" ? "Running" : "Start"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
              disabled={busy}
              className="h-8 px-2.5 text-[11px]"
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Installed models</Label>
          {models.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
              {status === "running"
                ? "No models installed yet — pull one below."
                : "Start the daemon to detect models."}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {models.map((m) => {
                const active = m.name === chatModel;
                return (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() =>
                      void import("@/modules/settings/store").then((mod) =>
                        mod.setOllamaChatModel(m.name),
                      )
                    }
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] transition-colors",
                      active
                        ? "border-foreground/40 bg-accent/60"
                        : "border-border/60 bg-transparent hover:bg-accent/30",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          active ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="font-mono">{m.name}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                      <span>{m.size}</span>
                      <span>{m.modified}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {chatModel ? (
            <span className="text-[10.5px] text-muted-foreground">
              Chat model:{" "}
              <span className="font-mono text-foreground">{chatModel}</span>{" "}
              · pick the “Ollama (local)” entry in the model dropdown above to
              use it.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Pull a model</Label>
          <div className="flex gap-1.5">
            <Input
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              placeholder="e.g. llama3.2  ·  qwen2.5-coder:7b  ·  deepseek-r1:8b"
              spellCheck={false}
              disabled={pulling !== null || busy}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void pull()}
              disabled={
                pulling !== null || busy || !pullName.trim() || status !== "running"
              }
              className="h-8 px-2.5 text-[11px]"
            >
              Pull
            </Button>
          </div>
          {pulling ? (
            <span className="text-[10.5px] text-amber-500">
              Pulling{" "}
              <span className="font-mono text-foreground">{pulling.name}</span>…
              this can take several minutes.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AutocompleteBlock({ keys }: { keys: KeysMap }) {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);

  const [modelDraft, setModelDraft] = useState(modelId);
  const [urlDraft, setUrlDraft] = useState(lmstudioBaseURL);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(ollamaBaseURL);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setUrlDraft(lmstudioBaseURL), [lmstudioBaseURL]);
  useEffect(() => setOllamaUrlDraft(ollamaBaseURL), [ollamaBaseURL]);

  const onProviderChange = (next: AutocompleteProviderId) => {
    void setAutocompleteProvider(next);
    const knownDefaults = Object.values(DEFAULT_AUTOCOMPLETE_MODEL);
    if (knownDefaults.includes(modelId)) {
      void setAutocompleteModelId(DEFAULT_AUTOCOMPLETE_MODEL[next]);
    }
  };

  const providerInfo = getProvider(provider);
  const hasKey = providerNeedsKey(provider) ? !!keys[provider] : true;

  const testLmStudio = async () => {
    setTestStatus("testing");
    try {
      const url = urlDraft.replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET" });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  const testOllama = async () => {
    setTestStatus("testing");
    try {
      const url = ollamaUrlDraft.replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET" });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label>Editor autocomplete</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Inline ghost-text suggestions in the code editor. Powered by
            ultra-fast inference (Cerebras / Groq) or a local LM Studio server.
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setAutocompleteEnabled(v)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <div className="flex gap-1">
            {AUTOCOMPLETE_PROVIDERS.map((id) => {
              const info = getProvider(id);
              const active = id === provider;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onProviderChange(id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] transition-colors",
                    active
                      ? "border-foreground/40 bg-accent/60"
                      : "border-border/60 bg-transparent hover:bg-accent/30",
                  )}
                >
                  <ProviderIcon provider={id} size={12} />
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>
          {!hasKey ? (
            <span className="text-[10.5px] text-amber-500">
              No API key configured for {providerInfo.label}. Add one above.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Model</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => {
              const v = modelDraft.trim();
              if (v && v !== modelId) void setAutocompleteModelId(v);
            }}
            placeholder={DEFAULT_AUTOCOMPLETE_MODEL[provider]}
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>

        {provider === "lmstudio" ? (
          <div className="flex flex-col gap-1.5">
            <Label>LM Studio base URL</Label>
            <div className="flex gap-1.5">
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onBlur={() => {
                  const v = urlDraft.trim();
                  if (v && v !== lmstudioBaseURL) void setLmstudioBaseURL(v);
                }}
                placeholder="http://localhost:1234/v1"
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testLmStudio()}
                className="h-8 px-2.5 text-[11px]"
              >
                Test
              </Button>
            </div>
            {testStatus === "ok" ? (
              <span className="text-[10.5px] text-emerald-500">
                Connected — server responded.
              </span>
            ) : testStatus === "fail" ? (
              <span className="text-[10.5px] text-destructive">
                Could not reach the server. Is LM Studio running?
              </span>
            ) : testStatus === "testing" ? (
              <span className="text-[10.5px] text-muted-foreground">
                Testing…
              </span>
            ) : null}
          </div>
        ) : null}

        {provider === "ollama" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Ollama base URL</Label>
            <div className="flex gap-1.5">
              <Input
                value={ollamaUrlDraft}
                onChange={(e) => setOllamaUrlDraft(e.target.value)}
                onBlur={() => {
                  const v = ollamaUrlDraft.trim();
                  if (v && v !== ollamaBaseURL) void setOllamaBaseURL(v);
                }}
                placeholder="http://localhost:11434/v1"
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testOllama()}
                className="h-8 px-2.5 text-[11px]"
              >
                Test
              </Button>
            </div>
            {testStatus === "ok" ? (
              <span className="text-[10.5px] text-emerald-500">
                Connected — Ollama responded.
              </span>
            ) : testStatus === "fail" ? (
              <span className="text-[10.5px] text-destructive">
                Could not reach Ollama. Start it from the Ollama section
                above, or run <code>ollama serve</code> in a terminal.
              </span>
            ) : testStatus === "testing" ? (
              <span className="text-[10.5px] text-muted-foreground">
                Testing…
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
