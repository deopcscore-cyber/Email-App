"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import type { Address, AttachmentDto, MessageDto } from "@novamail/shared";
import {
  avatarHue,
  displayName,
  formatBytes,
  formatFullTime,
  initials,
} from "@/lib/format";
import { useOverlayScope, useShortcut } from "@/features/shortcuts/use-shortcut";
import { popIn } from "@/lib/motion";
import { attachmentUrl } from "../lib/attachment-url";
import { transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MessageBody } from "./message-body";

/** Short collapsed-row summary, e.g. Gmail's "to me" -- the full recipient
 * list lives in the details popover instead of getting truncated inline. */
function toSummary(to: Address[], accountEmail: string | undefined): string {
  if (to.length === 0) return "";
  const isMe = (a: Address): boolean =>
    accountEmail !== undefined && a.email.toLowerCase() === accountEmail.toLowerCase();
  if (to.length === 1) return isMe(to[0] as Address) ? "to me" : `to ${displayName(to[0] as Address)}`;
  const others = to.filter((a) => !isMe(a));
  if (others.length === to.length - 1 && others.length > 0) {
    return others.length === 1
      ? `to me, ${displayName(others[0] as Address)}`
      : `to me and ${others.length} others`;
  }
  return `to ${displayName(to[0] as Address)} and ${to.length - 1} others`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1 text-[12px]">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

function addressList(list: Address[]): string {
  return list.map((a) => `${displayName(a)} <${a.email}>`).join(", ");
}

function MessageDetails({
  message,
  open,
  onClose,
}: {
  message: MessageDto;
  open: boolean;
  onClose: () => void;
}) {
  useOverlayScope(open);
  useShortcut("escape", onClose, { scope: "overlay", enabled: open });

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-label="Message details"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ transformOrigin: "top left" }}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-3 shadow-2xl"
          >
            <DetailRow label="from" value={`${displayName(message.from)} <${message.from.email}>`} />
            {message.to.length > 0 && <DetailRow label="to" value={addressList(message.to)} />}
            {message.cc.length > 0 && <DetailRow label="cc" value={addressList(message.cc)} />}
            <DetailRow label="date" value={formatFullTime(message.receivedAt)} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const PREVIEWABLE_TYPES = new Set(["application/pdf"]);

function AttachmentChip({ attachment }: { attachment: AttachmentDto }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const isPreviewable = isImage || PREVIEWABLE_TYPES.has(attachment.mimeType);
  const Icon = isImage ? ImageIcon : FileText;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
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
        {isPreviewable && (
          <button
            type="button"
            aria-label={
              previewOpen
                ? `Hide preview of ${attachment.filename}`
                : `Preview ${attachment.filename}`
            }
            aria-expanded={previewOpen}
            title="Preview"
            onClick={() => setPreviewOpen((v) => !v)}
            className={cn(
              "ml-2 rounded-md p-1.5 transition-colors hover:bg-surface hover:text-foreground",
              previewOpen ? "text-accent" : "text-muted-foreground",
            )}
          >
            <Eye className="size-3.5" aria-hidden />
          </button>
        )}
        <a
          href={attachmentUrl(attachment.id, "attachment")}
          download={attachment.filename}
          aria-label={`Download ${attachment.filename}`}
          title="Download"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <Download className="size-3.5" aria-hidden />
        </a>
      </div>

      <AnimatePresence initial={false}>
        {previewOpen && isImage && (
          <motion.img
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitions.enter}
            src={attachmentUrl(attachment.id, "inline")}
            alt={attachment.filename}
            className="max-h-96 max-w-full rounded-xl border border-border object-contain"
          />
        )}
        {previewOpen && !isImage && isPreviewable && (
          <motion.iframe
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 480, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitions.enter}
            src={attachmentUrl(attachment.id, "inline")}
            title={attachment.filename}
            className="w-full rounded-xl border border-border"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function MessageCard({
  message,
  defaultExpanded,
  accountEmail,
}: {
  message: MessageDto;
  defaultExpanded: boolean;
  accountEmail?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hue = avatarHue(message.from.email);

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-surface transition-shadow",
        expanded && "shadow-sm",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        className="relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
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
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-semibold">
              {displayName(message.from)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen((v) => !v);
              }}
              aria-expanded={detailsOpen}
              aria-label="Show message details"
              className="flex shrink-0 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {toSummary(message.to, accountEmail)}
              <ChevronDown
                aria-hidden
                className={cn("size-3 transition-transform", detailsOpen && "rotate-180")}
              />
            </button>
            <MessageDetails
              message={message}
              open={detailsOpen}
              onClose={() => setDetailsOpen(false)}
            />
          </span>
          {expanded ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {message.from.email}
            </span>
          ) : (
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
      </div>

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
              <MessageBody
                bodyHtml={message.bodyHtml}
                bodyText={message.bodyText}
                attachments={message.attachments}
              />

              {(() => {
                // Inline images (signatures, logos) already render inside
                // the body above -- listing them again as chips is noise.
                const downloadable = message.attachments.filter((a) => !a.isInline);
                return (
                  downloadable.length > 0 && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        {downloadable.length} attachment
                        {downloadable.length > 1 ? "s" : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {downloadable.map((a) => (
                          <AttachmentChip key={a.id} attachment={a} />
                        ))}
                      </div>
                    </div>
                  )
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
