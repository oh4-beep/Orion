import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

export type PaletteCommand = {
  id: string;
  label: string;
  /** Group heading, e.g. "File", "View", "AI". */
  group: string;
  /** Keyboard shortcut display tokens (e.g. ["⌘", "S"]) — purely cosmetic. */
  shortcut?: string[];
  /** Optional secondary text shown muted to the right. */
  hint?: string;
  /** Triggered on Enter. */
  run: () => void;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  commands: PaletteCommand[];
};

export function CommandPalette({ open, onOpenChange, commands }: Props) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Group items in stable order for the rendered list.
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    for (const c of commands) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return Array.from(map.entries());
  }, [commands]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] max-w-[640px] translate-y-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <Command className="bg-popover">
          <CommandInput
            placeholder="Type a command…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No commands match.</CommandEmpty>
            {grouped.map(([group, items], gi) => (
              <div key={group}>
                {gi > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group}>
                  {items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${group} ${c.label} ${c.hint ?? ""}`}
                      onSelect={() => {
                        onOpenChange(false);
                        // Defer so the dialog's exit animation doesn't stutter.
                        queueMicrotask(c.run);
                      }}
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint ? (
                        <span className="text-[11px] text-muted-foreground">
                          {c.hint}
                        </span>
                      ) : null}
                      {c.shortcut?.length ? (
                        <KbdGroup className="ml-2">
                          {c.shortcut.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </KbdGroup>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
