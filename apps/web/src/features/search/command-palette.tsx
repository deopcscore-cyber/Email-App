"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon,
  Clock,
  FileText,
  Inbox,
  Mail,
  Moon,
  Paperclip,
  PenLine,
  Search,
  Send,
  Sparkles,
  Star,
  Sun,
  SunMoon,
  Trash2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResultDto, ThreadListItemDto } from "@novamail/shared";
import { useUi } from "@/contexts/ui-context";
import { nlSearch } from "@/features/ai/api/ai.api";
import { useCompose } from "@/features/compose/compose-context";
import {
  useOverlayScope,
  useShortcut,
} from "@/features/shortcuts/use-shortcut";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api-client";
import { displayName, formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

function folderToPath(thread: ThreadListItemDto): string {
  if (thread.snoozedUntil !== null) return "/snoozed";
  const map: Record<string, string> = {
    INBOX: "/inbox",
    SENT: "/sent",
    DRAFTS: "/drafts",
    SPAM: "/spam",
    TRASH: "/trash",
    ARCHIVE: "/inbox",
  };
  return map[thread.folder] ?? "/inbox";
}

/**
 * Spotlight-style palette: instant email search (full-text + operators like
 * from:, has:attachment, before:) blended with app commands.
 */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setHelpOpen } = useUi();
  const { openNew } = useCompose();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 200);

  useOverlayScope(paletteOpen);
  useShortcut("escape", () => setPaletteOpen(false), {
    scope: "overlay",
    enabled: paletteOpen,
  });

  const nl = useMutation({ mutationFn: nlSearch });

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      nl.reset();
      setTimeout(() => inputRef.current?.focus(), 30);
    }
    // nl is stable (useMutation identity churn is irrelevant here)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen]);

  // New keystrokes leave AI-search mode.
  useEffect(() => {
    nl.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () =>
      api<SearchResultDto>(`/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: paletteOpen && debouncedQuery.length > 1,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
  // AI results take over the thread section once a compilation succeeds.
  const threads =
    nl.data !== undefined
      ? nl.data.threads
      : debouncedQuery.length > 1
        ? (searchResult?.threads ?? [])
        : [];
  const looksNatural =
    debouncedQuery.split(/\s+/).length >= 3 && nl.data === undefined;

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      router.push(path);
      setPaletteOpen(false);
    };
    return [
      { id: "compose", title: "Compose new email", hint: "c", icon: PenLine,
        run: () => { setPaletteOpen(false); openNew(); } },
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
  }, [router, setPaletteOpen, openNew, setHelpOpen, setTheme]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter((c) => c.title.toLowerCase().includes(q));
  }, [commands, query]);

  // Flattened selectable rows: threads first, then commands.
  const rowCount = threads.length + filteredCommands.length;
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, rowCount - 1)));
  }, [rowCount]);

  const activate = (i: number): void => {
    const thread = threads[i];
    if (thread !== undefined) {
      router.push(`${folderToPath(thread)}?t=${thread.id}`);
      setPaletteOpen(false);
      return;
    }
    filteredCommands[i - threads.length]?.run();
  };

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[16vh] backdrop-blur-[2px]"
          onClick={() => setPaletteOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Search and commands"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="w-[620px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search
                className={cn(
                  "size-4 shrink-0 text-muted-foreground",
                  isFetching && "animate-pulse text-accent",
                )}
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(i + 1, rowCount - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    activate(index);
                  }
                }}
                placeholder="Search mail — try “invoice from:stripe has:attachment”"
                aria-label="Search mail and commands"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                esc
              </kbd>
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-2">
              {/* AI natural-language escalation */}
              {looksNatural && (
                <button
                  type="button"
                  onClick={() => nl.mutate(query.trim())}
                  disabled={nl.isPending}
                  className="mb-1 flex w-full items-center gap-3 rounded-lg border border-dashed border-accent/40 bg-accent-soft/40 px-3 py-2 text-left text-[13px] text-accent transition-colors hover:bg-accent-soft"
                >
                  <Sparkles
                    className={cn("size-4", nl.isPending && "animate-pulse")}
                    aria-hidden
                  />
                  {nl.isPending
                    ? "Compiling your search…"
                    : `Ask AI: “${query.trim()}”`}
                </button>
              )}
              {nl.isError && (
                <p className="px-3 py-1 text-xs text-danger">
                  {nl.error instanceof Error ? nl.error.message : "AI search failed"}
                </p>
              )}
              {nl.data !== undefined && (
                <div className="mb-1 flex flex-wrap items-center gap-1.5 px-3 py-1.5">
                  <Sparkles className="size-3.5 text-accent" aria-hidden />
                  {nl.data.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent"
                    >
                      {chip}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => nl.reset()}
                    className="ml-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    clear
                  </button>
                </div>
              )}

              {threads.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Emails
                  </p>
                  <ul role="listbox" aria-label="Matching emails">
                    {threads.map((thread, i) => (
                      <li key={thread.id} role="option" aria-selected={i === index}>
                        <button
                          type="button"
                          onClick={() => activate(i)}
                          onMouseEnter={() => setIndex(i)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                            i === index && "bg-accent-soft",
                          )}
                        >
                          <Mail
                            className={cn(
                              "size-4 shrink-0",
                              i === index ? "text-accent" : "text-muted-foreground",
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-[13px] font-medium">
                                {thread.participants[0] !== undefined
                                  ? displayName(thread.participants[0])
                                  : thread.subject}
                              </span>
                              <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                                {thread.hasAttachments && (
                                  <Paperclip className="size-3" aria-hidden />
                                )}
                                {formatListTime(thread.lastMessageAt)}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {thread.subject} — {thread.snippet}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {filteredCommands.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Commands
                  </p>
                  <ul role="listbox" aria-label="Commands">
                    {filteredCommands.map((command, ci) => {
                      const i = threads.length + ci;
                      return (
                        <li key={command.id} role="option" aria-selected={i === index}>
                          <button
                            type="button"
                            onClick={() => activate(i)}
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
                      );
                    })}
                  </ul>
                </>
              )}

              {rowCount === 0 && (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No matches. Operators: from: to: in: is: has:attachment
                  label: before: after:
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
