"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, FileText, Image as ImageIcon } from "lucide-react";
import type { AttachmentDto, MessageDto } from "@novamail/shared";
import {
  avatarHue,
  displayName,
  formatBytes,
  formatFullTime,
  initials,
} from "@/lib/format";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";

function AttachmentChip({ attachment }: { attachment: AttachmentDto }) {
  const Icon = attachment.mimeType.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-muted px-3 py-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft">
        <Icon className="size-4 text-accent" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block max-w-44 truncate text-xs font-medium">
          {attachment.filename}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Download ${attachment.filename}`}
        title="Download (arrives in Phase 4)"
        className="ml-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      >
        <Download className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function MessageCard({
  message,
  defaultExpanded,
}: {
  message: MessageDto;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hue = avatarHue(message.from.email);

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-surface transition-shadow",
        expanded && "shadow-sm",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 55% 45%))`,
          }}
        >
          {initials(message.from)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold">
              {displayName(message.from)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              to {message.to.map((a) => displayName(a)).join(", ")}
            </span>
          </span>
          {!expanded && (
            <span className="block truncate text-xs text-muted-foreground">
              {message.snippet}
            </span>
          )}
        </span>
        <time
          dateTime={message.receivedAt}
          className="shrink-0 text-[11px] text-muted-foreground"
        >
          {formatFullTime(message.receivedAt)}
        </time>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitions.enter}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-16 max-md:pl-4">
              {/* Phase 4 renders sanitized bodyHtml in a sandboxed iframe;
                  seeded messages are plain text. */}
              <div className="whitespace-pre-wrap text-[13.5px] leading-6 text-foreground/90">
                {message.bodyText ?? ""}
              </div>

              {message.attachments.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {message.attachments.length} attachment
                    {message.attachments.length > 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {message.attachments.map((a) => (
                      <AttachmentChip key={a.id} attachment={a} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
