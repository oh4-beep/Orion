import { useChatStore } from "@/modules/ai";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddIcon,
  BubbleChatIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";

type Props = {
  /** Called after a session is selected/created so the host can open the AI panel. */
  onActivate: () => void;
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ChatList({ onActivate }: Props) {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const newSession = useChatStore((s) => s.newSession);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const handleNew = () => {
    newSession();
    onActivate();
  };

  const handlePick = (id: string) => {
    switchSession(id);
    onActivate();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Chats
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={handleNew}
          title="New chat"
        >
          <HugeiconsIcon icon={AddIcon} size={12} strokeWidth={2} />
          New
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
          No chats yet. Start one to talk with the AI.
        </div>
      ) : (
        <ul className="flex-1 overflow-auto px-1 pb-2">
          {sessions.map((s) => {
            const active = s.id === activeId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => handlePick(s.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
                    "hover:bg-accent/50",
                    active && "bg-accent/70 text-foreground",
                  )}
                  title={s.title}
                >
                  <HugeiconsIcon
                    icon={BubbleChatIcon}
                    size={12}
                    strokeWidth={1.6}
                    className={cn(
                      "shrink-0",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  />
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/80">
                    {relativeTime(s.updatedAt)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(e, s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleDelete(
                          e as unknown as React.MouseEvent,
                          s.id,
                        );
                      }
                    }}
                    className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground group-hover:flex"
                    title="Delete chat"
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={11}
                      strokeWidth={1.6}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
