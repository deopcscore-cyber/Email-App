"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { fadeUp, rowExit, staggerChildren } from "@/lib/motion";
import type { ListTab, MailView } from "@novamail/shared";
import { useUi } from "@/contexts/ui-context";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { cn } from "@/lib/utils";
import { useThreads, useTriageThread } from "../hooks/use-threads";
import { useMailSelection } from "../hooks/use-mail-selection";
import { EmailRow } from "./email-row";
import { ListSkeleton } from "./list-skeleton";

const VIEW_TITLES: Record<MailView, string> = {
  inbox: "Inbox",
  priority: "Priority",
  unread: "Unread",
  snoozed: "Snoozed",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  spam: "Spam",
  trash: "Trash",
};

export function EmailList({
  view,
  labelId,
  accountId,
}: {
  view: MailView;
  labelId?: string;
  accountId?: string;
}) {
  const [tab, setTab] = useState<ListTab>("focused");
  const effectiveTab = view === "inbox" && labelId === undefined ? tab : undefined;
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useThreads(view, effectiveTab, labelId, accountId);
  const triage = useTriageThread();
  const { selectedId, select } = useMailSelection();
  const { setPaletteOpen } = useUi();

  const threads = data?.pages.flatMap((p) => p.items) ?? [];

  // Keyboard focus (j/k) is independent from selection (enter/o).
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep focus index in range when the list changes.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, threads.length - 1)));
  }, [threads.length]);

  const focusRow = (index: number): void => {
    setFocusIndex(index);
    listRef.current
      ?.querySelectorAll("[role=option]")
      [index]?.scrollIntoView({ block: "nearest" });
  };

  useShortcut(
    "j",
    () => focusRow(Math.min(focusIndex + 1, threads.length - 1)),
    { description: "Next email" },
  );
  useShortcut("k", () => focusRow(Math.max(focusIndex - 1, 0)), {
    description: "Previous email",
  });
  useShortcut(
    "arrowdown",
    () => focusRow(Math.min(focusIndex + 1, threads.length - 1)),
    {},
  );
  useShortcut("arrowup", () => focusRow(Math.max(focusIndex - 1, 0)), {});
  useShortcut(
    "enter",
    () => {
      const t = threads[focusIndex];
      if (t !== undefined) select(t.id);
    },
    { description: "Open email" },
  );
  useShortcut(
    "o",
    () => {
      const t = threads[focusIndex];
      if (t !== undefined) select(t.id);
    },
    {},
  );
  useShortcut(
    "s",
    () => {
      const t = threads[focusIndex];
      if (t !== undefined) {
        triage.mutate({ id: t.id, patch: { isStarred: !t.isStarred } });
      }
    },
    { description: "Star / unstar" },
  );

  const onToggleStar = (id: string, isStarred: boolean): void => {
    triage.mutate({ id, patch: { isStarred } });
  };

  return (
    <section
      aria-label={VIEW_TITLES[view]}
      className="flex h-full w-[380px] shrink-0 flex-col border-r border-border max-lg:w-[320px] max-md:w-full max-md:border-r-0"
    >
      {/* Search trigger */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-3 text-[13px] text-muted-foreground transition-colors hover:border-accent/40"
        >
          <Search className="size-3.5" aria-hidden />
          Search anything…
          <kbd className="ml-auto rounded border border-border bg-surface px-1.5 font-sans text-[10px] leading-4">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Tabs (inbox only) */}
      {effectiveTab !== undefined ? (
        <div
          role="tablist"
          aria-label="Inbox tabs"
          className="mx-3 mt-3 flex border-b border-border"
        >
          {(["focused", "other"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-4 pb-2 text-[13px] font-medium capitalize transition-colors",
                tab === t
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {tab === t && (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          ))}
        </div>
      ) : (
        <h1 className="mx-3 mt-3 border-b border-border px-1 pb-2 text-[13px] font-semibold">
          {VIEW_TITLES[view]}
        </h1>
      )}

      {/* Rows */}
      <div
        ref={listRef}
        role="listbox"
        aria-label={`${VIEW_TITLES[view]} conversations`}
        className="flex-1 overflow-y-auto p-2"
      >
        {isPending ? (
          <ListSkeleton />
        ) : threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">Nothing here</p>
            <p className="text-xs text-muted-foreground">
              {view === "inbox" ? "You're all caught up." : "This folder is empty."}
            </p>
          </div>
        ) : (
          <motion.div
            key={`${view}:${effectiveTab ?? "all"}:${labelId ?? ""}:${accountId ?? ""}`}
            variants={staggerChildren(0.03)}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence initial={false}>
              {threads.map((thread, i) => (
                <motion.div
                  key={thread.id}
                  variants={fadeUp}
                  layout="position"
                  exit={rowExit}
                >
                  <EmailRow
                    thread={thread}
                    selected={thread.id === selectedId}
                    focused={i === focusIndex}
                    onSelect={(id) => {
                      setFocusIndex(i);
                      select(id);
                    }}
                    onToggleStar={onToggleStar}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {hasNextPage === true && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mt-2 w-full rounded-lg py-2 text-xs text-muted-foreground hover:bg-surface-muted"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </section>
  );
}
