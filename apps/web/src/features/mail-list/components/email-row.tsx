"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Archive, Check, Inbox, Paperclip, Pin, Star, Trash2 } from "lucide-react";
import type { ThreadListItemDto } from "@novamail/shared";
import { Avatar } from "@/components/avatar";
import { displayName, formatListTime } from "@/lib/format";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { SwipeableRow } from "./swipeable-row";

interface EmailRowProps {
  thread: ThreadListItemDto;
  selected: boolean;
  focused: boolean;
  marked: boolean;
  onSelect: (id: string) => void;
  onToggleMark: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onMoveToInbox: (id: string) => void;
}

export const EmailRow = memo(function EmailRow({
  thread,
  selected,
  focused,
  marked,
  onSelect,
  onToggleMark,
  onToggleStar,
  onArchive,
  onTrash,
  onMoveToInbox,
}: EmailRowProps) {
  const from = thread.participants[0] ?? { name: null, email: "unknown" };
  const unread = thread.unreadCount > 0;
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isSpam = thread.folder === "SPAM";

  return (
    <SwipeableRow
      enabled={isMobile}
      onArchive={() => onArchive(thread.id)}
      onTrash={() => onTrash(thread.id)}
    >
      <div
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        data-focused={focused || undefined}
        onClick={() => onSelect(thread.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(thread.id);
        }}
        className={cn(
          "group relative flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-colors duration-100",
          marked
            ? "bg-accent/10"
            : selected
              ? "bg-accent-soft"
              : focused
                ? "bg-surface-muted"
                : "hover:bg-surface-muted",
        )}
      >
        {/* Focus rail for keyboard navigation */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent opacity-0 transition-opacity",
            (focused || selected) && "opacity-100",
          )}
        />

        <button
          type="button"
          aria-label={marked ? "Deselect email" : "Select email"}
          aria-pressed={marked}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMark(thread.id);
          }}
          className="mt-0.5 shrink-0 rounded-full"
        >
          {marked ? (
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Check className="size-4" aria-hidden />
            </span>
          ) : (
            <Avatar email={from.email} name={from.name} size={36} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "truncate text-[13px]",
                unread ? "font-semibold text-foreground" : "text-foreground/80",
              )}
            >
              {displayName(from)}
            </span>
            {thread.messageCount > 1 && (
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {thread.messageCount}
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground transition-opacity group-hover:opacity-0">
              {thread.isPinned && (
                <Pin className="size-3 text-accent" aria-label="Pinned" />
              )}
              {thread.hasAttachments && (
                <Paperclip className="size-3" aria-label="Has attachments" />
              )}
              {thread.isStarred && (
                <Star
                  className="size-3 fill-amber-400 text-amber-400"
                  aria-label="Starred"
                />
              )}
              <time dateTime={thread.lastMessageAt}>
                {formatListTime(thread.lastMessageAt)}
              </time>
            </span>
          </div>

          <p
            className={cn(
              "truncate text-[13px] leading-5",
              unread ? "font-medium text-foreground" : "text-foreground/70",
            )}
          >
            {thread.subject}
          </p>

          <div className="flex items-center gap-2">
            <p className="truncate text-xs leading-5 text-muted-foreground">
              {thread.snippet}
            </p>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {thread.labels.slice(0, 2).map((label) => (
                <span
                  key={label.id}
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: label.color }}
                  title={label.name}
                />
              ))}
              {unread && thread.messageCount > 1 && (
                <span className="rounded-md bg-accent px-1.5 text-[10px] font-semibold leading-4 text-accent-foreground tabular-nums">
                  {thread.unreadCount}
                </span>
              )}
              {unread && thread.messageCount === 1 && (
                <span className="size-2 rounded-full bg-accent" aria-label="Unread" />
              )}
            </span>
          </div>
        </div>

        {/* Hover quick actions -- desktop only. On mobile these sat on an
            absolutely-positioned overlay directly on top of the timestamp
            with a solid background, hiding it entirely whenever this was
            forced visible; mobile's equivalent is the swipe gesture. */}
        <span className="absolute right-2 top-1.5 flex items-center gap-1 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {isSpam ? (
            <motion.button
              type="button"
              aria-label="Move to Inbox"
              title="Not spam -- move to Inbox"
              whileTap={{ scale: 0.75 }}
              onClick={(e) => {
                e.stopPropagation();
                onMoveToInbox(thread.id);
              }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Inbox className="size-3.5" aria-hidden />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              aria-label="Archive"
              title="Archive"
              whileTap={{ scale: 0.75 }}
              onClick={(e) => {
                e.stopPropagation();
                onArchive(thread.id);
              }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Archive className="size-3.5" aria-hidden />
            </motion.button>
          )}
          <motion.button
            type="button"
            aria-label="Delete"
            title="Delete"
            whileTap={{ scale: 0.75 }}
            onClick={(e) => {
              e.stopPropagation();
              onTrash(thread.id);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </motion.button>
          <motion.button
            type="button"
            aria-label={thread.isStarred ? "Unstar" : "Star"}
            title={thread.isStarred ? "Unstar" : "Star"}
            whileTap={{ scale: 0.75 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(thread.id, !thread.isStarred);
            }}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <Star
              className={cn(
                "size-3.5",
                thread.isStarred
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground",
              )}
              aria-hidden
            />
          </motion.button>
        </span>
      </div>
    </SwipeableRow>
  );
});
