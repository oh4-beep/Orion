import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { buildTheme, PALETTES, THEME_IDS, type ThemeId } from "./themes";

// Wire workers locally so Monaco doesn't try to fetch them from a CDN —
// Tauri runs from a tauri:// origin where CDN fetches are blocked anyway.
self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

// Bind @monaco-editor/react to the locally-bundled monaco instance instead of
// the default CDN loader. Must run before <Editor> mounts.
loader.config({ monaco });

// Register every shipped palette as a real Monaco theme.
const registered = new Set<string>();
for (const id of THEME_IDS) {
  monaco.editor.defineTheme(id, buildTheme(PALETTES[id]));
  registered.add(id);
}

const FALLBACK_THEME: ThemeId = "catppuccin-mocha";

export async function ensureMonacoTheme(id: string): Promise<string> {
  if (registered.has(id)) return id;
  return FALLBACK_THEME;
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  lua: "lua",
  vue: "html",
  dockerfile: "dockerfile",
};

export function languageForPath(path: string): string {
  const base = path.split("/").pop() ?? "";
  if (/^Dockerfile/i.test(base)) return "dockerfile";
  const ext = base.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANGUAGE[ext] ?? "plaintext";
}

export { monaco };
