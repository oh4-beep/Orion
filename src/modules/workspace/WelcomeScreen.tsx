import { useEffect } from "react";
import { useWorkspaceStore, type Recent } from "./store";
import { pickAndOpenFolder } from "./openFolder";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  FolderAddIcon,
  FolderLibraryIcon,
  Settings02Icon,
  TerminalIcon,
  CodeSquareIcon,
  Delete02Icon,
  AiBeautifyIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

type Props = {
  onNewTerminal: () => void;
  onNewEditor: () => void;
  onOpenSettings: () => void;
  onOpenAi: () => void;
  /** Called after the user selects a folder (picker or recents). */
  onFolderOpened: (path: string) => void;
  /** Path to start the file picker in. */
  defaultPickerPath?: string;
};

function shortPath(p: string, home: string | null): string {
  if (home && p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1) || p;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WelcomeScreen({
  onNewTerminal,
  onNewEditor,
  onOpenSettings,
  onOpenAi,
  onFolderOpened,
  defaultPickerPath,
}: Props) {
  const hydrate = useWorkspaceStore((s) => s.hydrate);
  const recents = useWorkspaceStore((s) => s.recents);
  const removeRecent = useWorkspaceStore((s) => s.removeRecent);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleOpenFolder = async () => {
    const picked = await pickAndOpenFolder(defaultPickerPath);
    if (picked) onFolderOpened(picked);
  };

  const handleOpenRecent = async (r: Recent) => {
    await useWorkspaceStore.getState().openRoot(r.path);
    onFolderOpened(r.path);
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto px-6 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        <Header />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ActionTile
            icon={FolderAddIcon}
            title="Open folder"
            hint="Pick a workspace to start working in."
            shortcut={["⌘", "O"]}
            onClick={handleOpenFolder}
            primary
          />
          <ActionTile
            icon={TerminalIcon}
            title="New terminal"
            hint="Open a shell in your home directory."
            shortcut={["⌘", "T"]}
            onClick={onNewTerminal}
          />
          <ActionTile
            icon={CodeSquareIcon}
            title="New file"
            hint="Create or open a file in the editor."
            shortcut={["⌘", "E"]}
            onClick={onNewEditor}
          />
          <ActionTile
            icon={AiBeautifyIcon}
            title="Ask the AI"
            hint="Talk to Terax about anything."
            shortcut={["⌘", "I"]}
            onClick={onOpenAi}
          />
        </div>

        <RecentList
          recents={recents}
          onPick={handleOpenRecent}
          onRemove={removeRecent}
        />

        <Footer onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="text-2xl font-semibold tracking-tight">Welcome to Terax</div>
      <div className="text-sm text-muted-foreground">
        An AI-native terminal & editor. Start by opening a folder.
      </div>
    </div>
  );
}

type TileProps = {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  title: string;
  hint: string;
  shortcut: string[];
  onClick: () => void;
  primary?: boolean;
};

function ActionTile({
  icon,
  title,
  hint,
  shortcut,
  onClick,
  primary,
}: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        "hover:border-foreground/25 hover:bg-accent/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary
          ? "border-foreground/20 bg-accent/20"
          : "border-border bg-card/40",
      )}
    >
      <div className="rounded-lg bg-accent/40 p-2 text-foreground/80 group-hover:bg-accent/60 group-hover:text-foreground">
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.6} />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">{title}</div>
          <KbdGroup className="opacity-60 group-hover:opacity-100">
            {shortcut.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

type RecentListProps = {
  recents: Recent[];
  onPick: (r: Recent) => void;
  onRemove: (path: string) => void;
};

function RecentList({ recents, onPick, onRemove }: RecentListProps) {
  if (recents.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            size={12}
            strokeWidth={1.8}
          />
          Recent folders
        </div>
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Nothing yet. Open a folder to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <HugeiconsIcon
          icon={FolderLibraryIcon}
          size={12}
          strokeWidth={1.8}
        />
        Recent folders
      </div>
      <ul className="flex flex-col rounded-lg border border-border bg-card/30">
        {recents.map((r) => (
          <li
            key={r.path}
            className="group flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30"
          >
            <button
              type="button"
              className="flex flex-1 items-center gap-3 text-left"
              onClick={() => onPick(r)}
              title={r.path}
            >
              <HugeiconsIcon
                icon={FolderLibraryIcon}
                size={14}
                strokeWidth={1.6}
                className="opacity-70"
              />
              <div className="flex min-w-0 flex-col">
                <div className="truncate text-sm font-medium">
                  {basename(r.path)}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {shortPath(r.path, null)}
                </div>
              </div>
              <div className="ml-auto text-[11px] text-muted-foreground">
                {relativeTime(r.lastOpened)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onRemove(r.path)}
              title="Remove from list"
              className="rounded p-1 opacity-0 transition-opacity hover:bg-accent/60 group-hover:opacity-70 hover:!opacity-100"
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                size={14}
                strokeWidth={1.6}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          Tip: press{" "}
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>{" "}
          for keyboard shortcuts.
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-xs"
        onClick={onOpenSettings}
      >
        <HugeiconsIcon icon={Settings02Icon} size={12} strokeWidth={1.8} />
        Settings
      </Button>
    </div>
  );
}
