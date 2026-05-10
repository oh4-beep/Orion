import type * as MonacoNs from "monaco-editor";
import type { AutocompleteProviderId } from "@/modules/ai/config";
import { requestCompletion } from "./autocomplete/provider";

type Prefs = {
  enabled: boolean;
  provider: AutocompleteProviderId;
  modelId: string;
  apiKey: string | null;
  lmstudioBaseURL: string;
  ollamaBaseURL: string;
};

type Deps = {
  getPrefs: () => Prefs;
  getPath: () => string;
};

// Per-language registration is fine — Monaco merges providers across calls,
// and we always pass the language we'll be editing first. The disposable
// returned tears down the provider when the editor unmounts.
export function registerInlineCompletions(
  monaco: typeof MonacoNs,
  language: string,
  deps: Deps,
): () => void {
  const provider: MonacoNs.languages.InlineCompletionsProvider = {
    async provideInlineCompletions(model, position, _ctx, token) {
      const prefs = deps.getPrefs();
      if (!prefs.enabled) return { items: [] };
      const keyless = prefs.provider === "lmstudio" || prefs.provider === "ollama";
      if (!keyless && !prefs.apiKey) return { items: [] };

      const offset = model.getOffsetAt(position);
      const full = model.getValue();
      const prefix = full.slice(0, offset);
      const suffix = full.slice(offset);

      const ctrl = new AbortController();
      const onCancel = token.onCancellationRequested(() => ctrl.abort());
      try {
        const text = await requestCompletion(
          {
            prefix,
            suffix,
            language,
            filename: deps.getPath(),
          },
          {
            provider: prefs.provider,
            modelId: prefs.modelId,
            apiKey: prefs.apiKey,
            lmstudioBaseURL: prefs.lmstudioBaseURL,
            ollamaBaseURL: prefs.ollamaBaseURL,
          },
          ctrl.signal,
        );
        if (!text) return { items: [] };
        return {
          items: [
            {
              insertText: text,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
            },
          ],
        };
      } catch {
        return { items: [] };
      } finally {
        onCancel.dispose();
      }
    },
    freeInlineCompletions() {
      // no-op
    },
  };

  // Register for all languages so it works across files.
  const d = monaco.languages.registerInlineCompletionsProvider(
    { pattern: "**/*" },
    provider,
  );
  return () => d.dispose();
}
