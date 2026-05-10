import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileExplorer } from "@/modules/explorer";
import { ChatList } from "./ChatList";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BubbleChatIcon,
  FolderLibraryIcon,
  Home01Icon,
} from "@hugeicons/core-free-icons";

export type SidebarPane = "files" | "chats";

type Props = {
  rootPath: string | null;
  onOpenFile: (path: string) => void;
  onPathRenamed: (oldPath: string, newPath: string) => void;
  onPathDeleted: (path: string) => void;
  onRevealInTerminal: (path: string) => void;
  onAttachToAgent: (path: string) => void;
  onOpenAi: () => void;
  onShowWelcome: () => void;
};

export function Sidebar({
  rootPath,
  onOpenFile,
  onPathRenamed,
  onPathDeleted,
  onRevealInTerminal,
  onAttachToAgent,
  onOpenAi,
  onShowWelcome,
}: Props) {
  const [pane, setPane] = useState<SidebarPane>("files");

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card">
      <div className="flex items-center gap-1 border-b border-border/60 px-1.5 py-1">
        <SegmentedTab
          active={pane === "files"}
          onClick={() => setPane("files")}
          icon={FolderLibraryIcon}
          label="Files"
        />
        <SegmentedTab
          active={pane === "chats"}
          onClick={() => setPane("chats")}
          icon={BubbleChatIcon}
          label="Chats"
        />
        <button
          type="button"
          title="Welcome screen"
          onClick={onShowWelcome}
          className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={Home01Icon} size={13} strokeWidth={1.6} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {pane === "files" ? (
          <FileExplorer
            rootPath={rootPath}
            onOpenFile={onOpenFile}
            onPathRenamed={onPathRenamed}
            onPathDeleted={onPathDeleted}
            onRevealInTerminal={onRevealInTerminal}
            onAttachToAgent={onAttachToAgent}
          />
        ) : (
          <ChatList onActivate={onOpenAi} />
        )}
      </div>
    </div>
  );
}

type TabProps = {
  active: boolean;
  onClick: () => void;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
};

function SegmentedTab({ active, onClick, icon, label }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-accent/70 text-foreground"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={12} strokeWidth={1.6} />
      {label}
    </button>
  );
}
