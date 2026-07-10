"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon,
  Clock,
  FileText,
  Inbox,
  Moon,
  PenLine,
  Search,
  Send,
  Star,
  Sun,
  SunMoon,
  Trash2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/contexts/ui-context";
import {
  useOverlayScope,
  useShortcut,
} from "@/features/shortcuts/use-shortcut";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

/**
 * Command palette shell: instant fuzzy commands now; email/NL search results
 * plug into the same surface in Phase 4.
 */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setComposeOpen, setHelpOpen } = useUi();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useOverlayScope(paletteOpen);
  useShortcut("escape", () => setPaletteOpen(false), {
    scope: "overlay",
    enabled: paletteOpen,
  });

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      // Focus after the enter animation starts.
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      setPaletteOpen(false);
    };
    return [
      { id: "compose", title: "Compose new email", hint: "c", icon: PenLine,
        run: () => { setPaletteOpen(false); setComposeOpen(true); } },
      { id: "inbox", title: "Go to Inbox", hint: "g i", icon: Inbox, run: go("/inbox") },
      { id: "priority", title: "Go to Priority", icon: Zap, run: go("/priority") },
      { id: "snoozed", title: "Go to Snoozed", icon: Clock, run: go("/snoozed") },
      { id: "starred", title: "Go to Starred", hint: "g t", icon: Star, run: go("/starred") },
      { id: "sent", title: "Go to Sent", hint: "g s", icon: Send, run: go("/sent") },
      { id: "drafts", title: "Go to Drafts", hint: "g d", icon: FileText, run: go("/drafts") },
      { id: "spam", title: "Go to Spam", icon: AlertOctagon, run: go("/spam") },
      { id: "trash", title: "Go to Trash", icon: Trash2, run: go("/trash") },
      { id: "theme-dark", title: "Theme: Dark", icon: Moon,
        run: () => { setTheme("dark"); setPaletteOpen(false); } },
      { id: "theme-light", title: "Theme: Light", icon: Sun,
        run: () => { setTheme("light"); setPaletteOpen(false); } },
      { id: "theme-system", title: "Theme: System", icon: SunMoon,
        run: () => { setTheme("system"); setPaletteOpen(false); } },
      { id: "help", title: "Keyboard shortcuts", hint: "?", icon: Search,
        run: () => { setPaletteOpen(false); setHelpOpen(true); } },
    ];
  }, [router, setPaletteOpen, setComposeOpen, setHelpOpen, setTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[18vh] backdrop-blur-[2px]"
          onClick={() => setPaletteOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    filtered[index]?.run();
                  }
                }}
                placeholder="Search or type a command…"
                aria-label="Search commands"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                esc
              </kbd>
            </div>

            <ul role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No matching commands. Email search arrives in Phase 4.
                </li>
              )}
              {filtered.map((command, i) => (
                <li key={command.id} role="option" aria-selected={i === index}>
                  <button
                    type="button"
                    onClick={command.run}
                    onMouseEnter={() => setIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px]",
                      i === index
                        ? "bg-accent-soft text-foreground"
                        : "text-foreground/80",
                    )}
                  >
                    <command.icon
                      className={cn(
                        "size-4",
                        i === index ? "text-accent" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    {command.title}
                    {command.hint !== undefined && (
                      <kbd className="ml-auto rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
