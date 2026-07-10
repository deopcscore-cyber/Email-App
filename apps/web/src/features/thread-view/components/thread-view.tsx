"use client";

import { motion } from "framer-motion";
import {
  Archive,
  ArrowLeft,
  Clock,
  Forward,
  MailOpen,
  Reply,
  ReplyAll,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useUi } from "@/contexts/ui-context";
import { useCompose } from "@/features/compose/compose-context";
import { useMailSelection } from "@/features/mail-list/hooks/use-mail-selection";
import { useTriageThread } from "@/features/mail-list/hooks/use-threads";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { SnoozePopover } from "@/features/snooze/snooze-popover";
import { displayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMarkReadOnOpen, useThread } from "../hooks/use-thread";
import { MessageCard } from "./message-card";

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function ThreadView() {
  const { selectedId, close } = useMailSelection();
  const { data: thread, isPending } = useThread(selectedId);
  const triage = useTriageThread();
  const { toggleAiPanel } = useUi();
  const { openFromThread } = useCompose();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  useMarkReadOnOpen(selectedId, thread?.unreadCount);

  const hasThread = selectedId !== null && thread !== undefined;

  useShortcut("escape", () => close(), {
    description: "Back to list",
    enabled: selectedId !== null && !snoozeOpen,
  });
  useShortcut(
    "e",
    () => {
      if (selectedId !== null) {
        triage.mutate({ id: selectedId, patch: { folder: "ARCHIVE" } });
        close();
      }
    },
    { description: "Archive", enabled: selectedId !== null },
  );
  useShortcut(
    "shift+3",
    () => {
      if (selectedId !== null) {
        triage.mutate({ id: selectedId, patch: { folder: "TRASH" } });
        close();
      }
    },
    { description: "Delete", enabled: selectedId !== null },
  );
  useShortcut(
    "u",
    () => {
      if (selectedId !== null) {
        triage.mutate({ id: selectedId, patch: { isRead: false } });
        close();
      }
    },
    { description: "Mark unread", enabled: selectedId !== null },
  );
  useShortcut("r", () => hasThread && openFromThread(thread, "reply"), {
    description: "Reply",
    enabled: hasThread,
  });
  useShortcut("a", () => hasThread && openFromThread(thread, "replyAll"), {
    description: "Reply all",
    enabled: hasThread,
  });
  useShortcut("f", () => hasThread && openFromThread(thread, "forward"), {
    description: "Forward",
    enabled: hasThread,
  });
  useShortcut("h", () => setSnoozeOpen(true), {
    description: "Snooze",
    enabled: selectedId !== null,
  });

  if (selectedId === null) {
    return (
      <section
        aria-label="Reading pane"
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 text-center max-md:hidden"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-muted">
          <MailOpen className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <p className="text-sm font-medium">Select an email to read</p>
        <p className="text-xs text-muted-foreground">
          Use <kbd className="rounded border border-border px-1">j</kbd> /{" "}
          <kbd className="rounded border border-border px-1">k</kbd> to
          navigate, <kbd className="rounded border border-border px-1">Enter</kbd>{" "}
          to open
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Reading pane"
      className="flex min-w-0 flex-1 flex-col max-md:absolute max-md:inset-0 max-md:z-10 max-md:bg-background"
    >
      {/* Toolbar */}
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <ToolbarButton label="Back to list" onClick={close}>
          <ArrowLeft className="size-4" aria-hidden />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Archive (e)"
          onClick={() => {
            triage.mutate({ id: selectedId, patch: { folder: "ARCHIVE" } });
            close();
          }}
        >
          <Archive className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Delete (#)"
          onClick={() => {
            triage.mutate({ id: selectedId, patch: { folder: "TRASH" } });
            close();
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton label="Snooze (h)" onClick={() => setSnoozeOpen(true)}>
            <Clock className="size-4" aria-hidden />
          </ToolbarButton>
          <SnoozePopover
            threadId={selectedId}
            open={snoozeOpen}
            onClose={() => setSnoozeOpen(false)}
            onSnoozed={close}
          />
        </div>
        <ToolbarButton
          label={thread?.isStarred === true ? "Unstar (s)" : "Star (s)"}
          onClick={() =>
            thread !== undefined &&
            triage.mutate({
              id: selectedId,
              patch: { isStarred: !thread.isStarred },
            })
          }
        >
          <Star
            className={cn(
              "size-4",
              thread?.isStarred === true && "fill-amber-400 text-amber-400",
            )}
            aria-hidden
          />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Reply (r)"
          onClick={() => hasThread && openFromThread(thread, "reply")}
        >
          <Reply className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Reply all (a)"
          onClick={() => hasThread && openFromThread(thread, "replyAll")}
        >
          <ReplyAll className="size-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Forward (f)"
          onClick={() => hasThread && openFromThread(thread, "forward")}
        >
          <Forward className="size-4" aria-hidden />
        </ToolbarButton>
        <button
          type="button"
          onClick={toggleAiPanel}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/70"
        >
          <Sparkles className="size-3.5" aria-hidden />
          AI Assistant
          <kbd className="rounded border border-accent/20 px-1 text-[10px]">⌘J</kbd>
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 max-md:px-3">
        {isPending || thread === undefined ? (
          <div className="space-y-3">
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-surface-muted" />
            <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
          </div>
        ) : (
          <motion.div
            key={thread.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">
                {thread.subject}
              </h1>
              {thread.labels.map((label) => (
                <span
                  key={label.id}
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: `${label.color}1a`,
                    color: label.color,
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {thread.messages
                .filter((m) => m.bodyHtml !== null || m.bodyText !== null)
                .map((message, i, visible) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    defaultExpanded={i === visible.length - 1 || !message.isRead}
                  />
                ))}
            </div>

            {/* Quick reply */}
            <button
              type="button"
              onClick={() => openFromThread(thread, "reply")}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40"
            >
              <Reply className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-[13px] text-muted-foreground">
                Reply to{" "}
                {thread.participants[0] !== undefined
                  ? displayName(thread.participants[0])
                  : "sender"}
                …
              </span>
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                r
              </kbd>
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}
