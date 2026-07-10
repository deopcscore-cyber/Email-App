"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Paperclip, Send, X } from "lucide-react";
import { useState } from "react";
import { useUi } from "@/contexts/ui-context";
import { useShortcut, useOverlayScope } from "@/features/shortcuts/use-shortcut";

/**
 * Compose shell (docked bottom-right, per Superhuman). Fields are live local
 * state; drafts, attachments, and sending wire up in Phase 4.
 */
export function ComposeModal() {
  const { composeOpen, setComposeOpen } = useUi();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useOverlayScope(composeOpen);
  useShortcut("escape", () => setComposeOpen(false), {
    scope: "overlay",
    enabled: composeOpen,
  });

  return (
    <AnimatePresence>
      {composeOpen && (
        <motion.div
          role="dialog"
          aria-label="New message"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-30 flex w-[520px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl max-md:inset-x-2 max-md:bottom-2 max-md:w-auto"
        >
          <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">New message</h2>
            <button
              type="button"
              aria-label="Expand"
              title="Full-screen compose arrives in Phase 4"
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Close compose"
              onClick={() => setComposeOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="flex flex-col">
            <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="w-12 text-muted-foreground">To</span>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 bg-transparent outline-none"
                autoFocus
              />
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Cc
              </button>
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Bcc
              </button>
            </label>
            <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="w-12 text-muted-foreground">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-transparent outline-none"
              />
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              aria-label="Message body"
              rows={10}
              className="resize-none bg-transparent px-4 py-3 text-[13px] leading-6 outline-none placeholder:text-muted-foreground"
            />
          </div>

          <footer className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <button
              type="button"
              disabled
              title="Sending arrives in Phase 4"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-4 py-2 text-[13px] font-medium text-white opacity-60"
            >
              <Send className="size-3.5" aria-hidden />
              Send
            </button>
            <button
              type="button"
              disabled
              aria-label="Attach files"
              title="Attachments arrive in Phase 4"
              className="rounded-lg p-2 text-muted-foreground opacity-60"
            >
              <Paperclip className="size-4" aria-hidden />
            </button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Sending & drafts arrive in Phase 4
            </span>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
