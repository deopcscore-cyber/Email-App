"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useUi } from "@/contexts/ui-context";
import { useMailSelection } from "@/features/mail-list/hooks/use-mail-selection";
import { useThread } from "@/features/thread-view/hooks/use-thread";
import { useThreadCounts } from "@/features/mail-list/hooks/use-threads";
import { useMediaQuery } from "@/hooks/use-media-query";
import { avatarHue, displayName, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "What is the main point?",
  "List action items",
  "What's the deadline?",
] as const;

/**
 * Phase 3 ships the panel chrome with live mailbox data (sender insights,
 * daily counts); the OpenAI-backed actions light up in Phase 5 — no fake AI.
 */
export function AiPanel() {
  const { aiPanelOpen, toggleAiPanel } = useUi();
  const { selectedId } = useMailSelection();
  const { data: thread } = useThread(selectedId);
  const { data: counts } = useThreadCounts();
  const overlay = useMediaQuery("(max-width: 1279px)");

  const sender = thread?.participants[0];

  return (
    <AnimatePresence>
      {aiPanelOpen && (
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          aria-label="AI assistant"
          className={cn(
            "flex h-full w-80 shrink-0 flex-col gap-3 overflow-y-auto p-3 pl-1",
            overlay &&
              "fixed right-0 top-0 z-20 bg-chrome pl-3 shadow-2xl",
          )}
        >
          {/* Ask card */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden />
              <h2 className="text-[13px] font-semibold">AI Assistant</h2>
              <button
                type="button"
                onClick={toggleAiPanel}
                aria-label="Close AI panel"
                className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2">
              <input
                type="text"
                disabled
                placeholder="Ask anything about this email…"
                aria-label="Ask the AI assistant"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              <span
                className="flex size-6 items-center justify-center rounded-full bg-accent/40"
                title="AI arrives in Phase 5"
              >
                <ArrowRight className="size-3 text-white" aria-hidden />
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled
                  title="AI arrives in Phase 5"
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground opacity-70"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Sender insights (live data) */}
          {sender !== undefined && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-[13px] font-semibold">Sender Insights</h3>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-10 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{
                    background: `linear-gradient(135deg, hsl(${avatarHue(sender.email)} 55% 55%), hsl(${(avatarHue(sender.email) + 40) % 360} 55% 45%))`,
                  }}
                >
                  {initials(sender)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {displayName(sender)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {sender.email}
                  </p>
                </div>
              </div>
              {thread !== undefined && (
                <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Messages in thread</dt>
                    <dd className="font-medium tabular-nums">
                      {thread.messageCount}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Attachments</dt>
                    <dd className="font-medium">
                      {thread.hasAttachments ? "Yes" : "None"}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          {/* Your day (live counts) */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="mb-1 text-[13px] font-semibold">Your day</h3>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <div className="flex gap-4">
              <div>
                <p className="text-xl font-semibold text-accent tabular-nums">
                  {counts?.inbox ?? 0}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Emails to
                  <br />
                  respond
                </p>
              </div>
              <div>
                <p className="text-xl font-semibold text-emerald-500 tabular-nums">
                  {counts?.snoozed ?? 0}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Snoozed
                  <br />
                  returning
                </p>
              </div>
              <div>
                <p className="text-xl font-semibold text-amber-500 tabular-nums">
                  {counts?.drafts ?? 0}
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Drafts to
                  <br />
                  finish
                </p>
              </div>
            </div>
          </div>

          <p className="px-1 text-center text-[10px] text-muted-foreground/70">
            Summaries, replies & smart search arrive in Phase 5 — powered by
            OpenAI, never faked.
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
