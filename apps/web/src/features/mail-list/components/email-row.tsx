"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Paperclip, Pin, Star } from "lucide-react";
import type { ThreadListItemDto } from "@novamail/shared";
import {
  avatarHue,
  displayName,
  formatListTime,
  initials,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface EmailRowProps {
  thread: ThreadListItemDto;
  selected: boolean;
  focused: boolean;
  onSelect: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
}

export const EmailRow = memo(function EmailRow({
  thread,
  selected,
  focused,
  onSelect,
  onToggleStar,
}: EmailRowProps) {
  const from = thread.participants[0] ?? { name: null, email: "unknown" };
  const unread = thread.unreadCount > 0;
  const hue = avatarHue(from.email);

  return (
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
        selected
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

      <span
        aria-hidden
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 55% 45%))`,
        }}
      >
        {initials(from)}
      </span>

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

      {/* Hover star */}
      <motion.button
        type="button"
        aria-label={thread.isStarred ? "Unstar" : "Star"}
        whileTap={{ scale: 0.75 }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(thread.id, !thread.isStarred);
        }}
        className="absolute right-2 top-1.5 rounded-md border border-border bg-surface p-1 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
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
    </div>
  );
});
