"use client";

import { motion } from "framer-motion";
import {
  Archive,
  ArrowLeft,
  Clock,
  Forward,
  Inbox,
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
import { useSession } from "@/features/auth/use-session";
import { useMailSelection } from "@/features/mail-list/hooks/use-mail-selection";
import { useTriageThread } from "@/features/mail-list/hooks/use-threads";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { SnoozePopover } from "@/features/snooze/snooze-popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { displayName } from "@/lib/format";
import { fadeUp, staggerChildren, transitions } from "@/lib/motion";
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
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {children}
    </motion.button>
  );
}

export function ThreadView() {
  const { selectedId, close } = useMailSelection();
  const { data: thread, isPending } = useThread(selectedId);
  const { data: user } = useSession();
  const triage = useTriageThread();
  const { toggleAiPanel } = useUi();
  const { openFromThread } = useCompose();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const accountEmail = user?.accounts.find((a) => a.id === thread?.accountId)?.email;
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
        const rescue = thread?.folder === "SPAM" || thread?.folder === "ARCHIVE";
        triage.mutate({
          id: selectedId,
          patch: { folder: rescue ? "INBOX" : "ARCHIVE" },
        });
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
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="show"
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
      </motion.section>
    );
  }

  return (
    <motion.section
      key={isMobile ? selectedId : "thread-pane"}
      initial={isMobile ? { x: 24, opacity: 0 } : false}
      animate={{ x: 0, opacity: 1 }}
      transition={transitions.enter}
      aria-label="Reading pane"
      className="flex min-w-0 flex-1 flex-col max-md:absolute max-md:inset-0 max-md:z-10 max-md:bg-background"
    >
      {/* Toolbar */}
      <header className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2">
        <ToolbarButton label="Back to list" onClick={close}>
          <ArrowLeft className="size-4" aria-hidden />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" aria-hidden />
        {thread?.folder === "SPAM" || thread?.folder === "ARCHIVE" ? (
          <ToolbarButton
            label="Move to Inbox"
            onClick={() => {
              triage.mutate({ id: selectedId, patch: { folder: "INBOX" } });
              close();
            }}
          >
            <Inbox className="size-4" aria-hidden />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            label="Archive (e)"
            onClick={() => {
              triage.mutate({ id: selectedId, patch: { folder: "ARCHIVE" } });
              close();
            }}
          >
            <Archive className="size-4" aria-hidden />
          </ToolbarButton>
        )}
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
          <motion.span
            key={thread?.isStarred ? "starred" : "unstarred"}
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={transitions.spring}
            className="block"
          >
            <Star
              className={cn(
                "size-4",
                thread?.isStarred === true && "fill-amber-400 text-amber-400",
              )}
              aria-hidden
            />
          </motion.span>
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
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={toggleAiPanel}
          aria-label="AI Assistant"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/70"
        >
          <Sparkles className="size-3.5" aria-hidden />
          <span className="max-md:hidden">AI Assistant</span>
          <kbd className="rounded border border-accent/20 px-1 text-[10px] max-md:hidden">
            ⌘J
          </kbd>
        </motion.button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-5 max-md:px-3">
        {isPending || thread === undefined ? (
          <div className="space-y-3">
            <div className="skeleton h-7 w-2/3 rounded-lg" />
            <div className="skeleton h-40 rounded-2xl" />
          </div>
        ) : (
          <motion.div
            key={thread.id}
            variants={staggerChildren(0.06)}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={fadeUp} className="mb-4 flex items-center gap-2.5">
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
            </motion.div>

            <div className="flex flex-col gap-3">
              {thread.messages
                .filter((m) => m.bodyHtml !== null || m.bodyText !== null)
                .map((message, i, visible) => (
                  <motion.div key={message.id} variants={fadeUp}>
                    <MessageCard
                      message={message}
                      defaultExpanded={i === visible.length - 1 || !message.isRead}
                      accountEmail={accountEmail}
                    />
                  </motion.div>
                ))}
            </div>

            {/* Quick reply */}
            <motion.button
              type="button"
              variants={fadeUp}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => openFromThread(thread, "reply")}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors hover:border-accent/40"
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
            </motion.button>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
