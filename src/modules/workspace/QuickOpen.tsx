import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { native } from "@/modules/ai/lib/native";
import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon } from "@hugeicons/core-free-icons";
import { Kbd } from "@/components/ui/kbd";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rootPath: string | null;
  onPick: (path: string) => void;
};

type Hit = {
  /** Full absolute path. */
  path: string;
  /** Path relative to the workspace root. */
  rel: string;
  /** Just the file name (basename). */
  name: string;
};

const MAX_FILES = 5000;
const MAX_SHOWN = 100;

/**
 * VS Code-style "Go to file" dialog. ⌘P opens; type to fuzzy-match by file
 * name first, then relative path; Enter opens the highlighted file.
 */
export function QuickOpen({ open, onOpenChange, rootPath, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRoot = useRef<string | null>(null);

  // Reload the file list when the dialog opens or the root changes.
  useEffect(() => {
    if (!open || !rootPath) return;
    if (loadedRoot.current === rootPath && files) return;
    setLoading(true);
    void native
      .glob({ pattern: "**/*", root: rootPath, maxResults: MAX_FILES })
      .then((res) => {
        const hits: Hit[] = res.hits.map((h) => ({
          path: h.path,
          rel: h.rel,
          name: basename(h.rel),
        }));
        setFiles(hits);
        loadedRoot.current = rootPath;
      })
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open, rootPath, files]);

  // Reset query each time the dialog opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const ranked = useMemo(() => {
    if (!files) return [];
    if (!query.trim()) {
      // Default order: shortest path first — keeps top-of-project files
      // discoverable when you open ⌘P with no query.
      return files
        .slice()
        .sort((a, b) => a.rel.length - b.rel.length)
        .slice(0, MAX_SHOWN);
    }
    return rankFiles(files, query).slice(0, MAX_SHOWN);
  }, [files, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] max-w-[640px] translate-y-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <Command shouldFilter={false} className="bg-popover">
          <CommandInput
            placeholder={
              rootPath
                ? "Go to file…  (type to filter)"
                : "Open a folder first (⌘O)"
            }
            value={query}
            onValueChange={setQuery}
            disabled={!rootPath}
          />
          <CommandList className="max-h-[420px]">
            {loading && (!files || files.length === 0) ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Indexing files…
              </div>
            ) : null}
            {!loading && files && files.length === 0 ? (
              <CommandEmpty>No files in this workspace.</CommandEmpty>
            ) : null}
            {!loading && ranked.length === 0 && query.trim().length > 0 ? (
              <CommandEmpty>No matches.</CommandEmpty>
            ) : null}
            {ranked.map((hit) => (
              <CommandItem
                key={hit.path}
                value={hit.rel}
                onSelect={() => {
                  onPick(hit.path);
                  onOpenChange(false);
                }}
                className="flex items-center gap-2"
              >
                <HugeiconsIcon
                  icon={File02Icon}
                  size={13}
                  strokeWidth={1.6}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate font-medium">{hit.name}</span>
                <span className="ml-auto truncate pl-3 text-[11px] text-muted-foreground">
                  {dirname(hit.rel)}
                </span>
              </CommandItem>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd>
              <span>navigate</span>
              <Kbd>↵</Kbd>
              <span>open</span>
              <Kbd>Esc</Kbd>
              <span>close</span>
            </div>
            {files ? <span>{files.length} files</span> : null}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? "" : p.slice(0, i);
}

/**
 * Score files against a query and return them ordered best-match first.
 *
 * Scoring favors: matches in the basename, contiguous matches, and earlier
 * positions. Non-matches are dropped. This is a deliberately simple variant
 * of the VS Code algorithm — fast enough for ~5k files without WASM.
 */
function rankFiles(files: Hit[], query: string): Hit[] {
  const q = query.toLowerCase();
  const scored: Array<{ hit: Hit; score: number }> = [];
  for (const hit of files) {
    const nameScore = subseqScore(hit.name.toLowerCase(), q);
    if (nameScore != null) {
      scored.push({ hit, score: nameScore + 100 });
      continue;
    }
    const relScore = subseqScore(hit.rel.toLowerCase(), q);
    if (relScore != null) scored.push({ hit, score: relScore });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.hit);
}

/**
 * Returns a positive score if every char of `q` appears in `s` in order,
 * otherwise null. Higher score = better match (contiguous chars, early
 * position, ends-with bonus, basename bonus).
 */
function subseqScore(s: string, q: string): number | null {
  if (q.length === 0) return 0;
  let score = 0;
  let lastIdx = -1;
  let consecutive = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = s.indexOf(q[i], lastIdx + 1);
    if (idx === -1) return null;
    if (idx === lastIdx + 1) {
      consecutive += 1;
      score += 5 + consecutive;
    } else {
      consecutive = 0;
      score += 1;
    }
    if (idx === 0 || s[idx - 1] === "/" || s[idx - 1] === "-" || s[idx - 1] === "_") {
      score += 3;
    }
    lastIdx = idx;
  }
  // Penalize long strings that "buried" the match.
  score -= Math.max(0, lastIdx - q.length);
  return score;
}
