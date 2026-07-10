"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Languages,
  ListChecks,
  MessageSquareReply,
  Sparkles,
  Tags,
  Wand2,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ThreadDetailDto } from "@novamail/shared";
import { useUi } from "@/contexts/ui-context";
import { useCompose } from "@/features/compose/compose-context";
import { useMailSelection } from "@/features/mail-list/hooks/use-mail-selection";
import { useThread } from "@/features/thread-view/hooks/use-thread";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import {
  dismissReminder,
  fetchActionItems,
  fetchBriefing,
  fetchReminders,
  fetchReplySuggestions,
  fetchSmartLabels,
  streamAsk,
  streamExplain,
  streamSummary,
  streamTranslate,
} from "../api/ai.api";
import { useAiStream } from "../hooks/use-ai-stream";
import { StreamingText } from "./streaming-text";

const LANGUAGES = ["English", "Spanish", "French", "German", "Japanese"] as const;

function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      {title !== undefined && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Live AI actions for the selected thread. */
function ThreadAssistant({ thread }: { thread: ThreadDetailDto }) {
  const stream = useAiStream();
  const [streamLabel, setStreamLabel] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const { openFromThread } = useCompose();
  const queryClient = useQueryClient();

  // Reset outputs when switching threads.
  useEffect(() => {
    stream.reset();
    setStreamLabel(null);
    setQuestion("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  const suggestions = useMutation({ mutationFn: fetchReplySuggestions });
  const actionItems = useMutation({ mutationFn: fetchActionItems });
  const smartLabels = useMutation({
    mutationFn: fetchSmartLabels,
    onSuccess: (result) => {
      toast(
        result.labels.length > 0
          ? `Suggested labels: ${result.labels.join(", ")}`
          : "No matching labels for this thread",
      );
      void queryClient.invalidateQueries({ queryKey: ["labels"] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const runStream = (
    label: string,
    start: Parameters<typeof stream.run>[0],
  ): void => {
    setStreamLabel(label);
    stream.run(start);
  };

  const actions = [
    {
      label: "Summarize",
      icon: Sparkles,
      run: () => runStream("Summary", (cb) => streamSummary(thread.id, cb)),
    },
    {
      label: "Reply ideas",
      icon: MessageSquareReply,
      run: () => suggestions.mutate(thread.id),
    },
    {
      label: "Action items",
      icon: ListChecks,
      run: () => actionItems.mutate(thread.id),
    },
    {
      label: "Explain",
      icon: Wand2,
      run: () => runStream("Context", (cb) => streamExplain(thread.id, cb)),
    },
    {
      label: "Labels",
      icon: Tags,
      run: () => smartLabels.mutate(thread.id),
    },
  ] as const;

  return (
    <>
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <h2 className="text-[13px] font-semibold">AI Assistant</h2>
        </div>

        {/* Ask anything */}
        <form
          className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = question.trim();
            if (q !== "") {
              runStream(`Q: ${q}`, (cb) => streamAsk(thread.id, q, cb));
              setQuestion("");
            }
          }}
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this email…"
            aria-label="Ask the AI assistant about this email"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label="Ask"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent transition-transform active:scale-95"
          >
            <ArrowRight className="size-3 text-accent-foreground" aria-hidden />
          </button>
        </form>

        {/* Actions */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {actions.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Icon className="size-3" aria-hidden />
              {label}
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Languages className="size-3" aria-hidden />
              Translate
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setLangOpen(false);
                      runStream(`Translation (${lang})`, (cb) =>
                        streamTranslate(thread.id, lang, cb),
                      );
                    }}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface-muted"
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Streaming output */}
      {streamLabel !== null && (
        <Card
          title={streamLabel}
          action={
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                stream.reset();
                setStreamLabel(null);
              }}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          }
        >
          {stream.status === "error" ? (
            <p className="text-xs text-danger">{stream.error}</p>
          ) : stream.text === "" ? (
            <div className="space-y-2" aria-label="Thinking">
              <div className="h-2.5 w-full animate-pulse rounded bg-surface-muted" />
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-surface-muted" />
            </div>
          ) : (
            <StreamingText text={stream.text} status={stream.status} />
          )}
        </Card>
      )}

      {/* Reply suggestions */}
      {(suggestions.isPending || suggestions.data !== undefined) && (
        <Card title="Reply suggestions">
          {suggestions.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {suggestions.data?.suggestions.map((s) => (
                <button
                  key={s.tone}
                  type="button"
                  onClick={() =>
                    openFromThread(thread, "reply", {
                      bodyHtml: `<p>${s.body.replace(/\n/g, "<br>")}</p>`,
                    })
                  }
                  className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-left transition-colors hover:border-accent/50"
                >
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {s.tone}
                  </span>
                  <span className="line-clamp-3 text-xs leading-5 text-foreground/85">
                    {s.body}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Action items */}
      {(actionItems.isPending || actionItems.data !== undefined) && (
        <Card title="Action items">
          {actionItems.isPending ? (
            <div className="space-y-2">
              <div className="h-4 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
            </div>
          ) : actionItems.data !== undefined &&
            actionItems.data.items.length === 0 &&
            actionItems.data.meeting === null ? (
            <p className="text-xs text-muted-foreground">
              Nothing actionable in this thread.
            </p>
          ) : (
            <ul className="space-y-2">
              {actionItems.data?.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckSquare className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                  <span className="text-xs leading-5">
                    {item.text}
                    {item.deadline !== null && (
                      <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
                        {item.deadline}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {actionItems.data?.meeting !== null &&
                actionItems.data?.meeting !== undefined && (
                  <li className="flex items-start gap-2 border-t border-border pt-2">
                    <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden />
                    <span className="text-xs leading-5">
                      Meeting: {actionItems.data.meeting.title}
                      {actionItems.data.meeting.proposedTime !== null &&
                        ` — ${actionItems.data.meeting.proposedTime}`}
                    </span>
                  </li>
                )}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/** Daily briefing + follow-ups, shown when no thread is open. */
function DailyBriefing() {
  const { select } = useMailSelection();
  const [requested, setRequested] = useState(false);
  const briefing = useQuery({
    queryKey: ["ai", "briefing"],
    queryFn: fetchBriefing,
    enabled: requested,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const reminders = useQuery({
    queryKey: ["ai", "reminders"],
    queryFn: fetchReminders,
    enabled: requested && briefing.isSuccess,
  });
  const queryClient = useQueryClient();

  return (
    <>
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <h2 className="text-[13px] font-semibold">Daily briefing</h2>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>

        {!requested ? (
          <button
            type="button"
            onClick={() => setRequested(true)}
            className="w-full rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-4 py-2.5 text-xs font-medium text-white transition-[filter] hover:brightness-110"
          >
            Generate today&apos;s briefing
          </button>
        ) : briefing.isPending ? (
          <div className="space-y-2" aria-label="Generating briefing">
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
          </div>
        ) : briefing.isError ? (
          <p className="text-xs text-danger">
            {briefing.error instanceof Error
              ? briefing.error.message
              : "Briefing failed"}
          </p>
        ) : (
          <>
            <p className="mb-3 text-[13px] font-medium leading-5">
              {briefing.data.headline}
            </p>
            <ul className="space-y-2">
              {briefing.data.important.map((item) => (
                <li key={item.threadId}>
                  <button
                    type="button"
                    onClick={() => select(item.threadId)}
                    className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span className="block truncate text-xs font-medium">
                      {item.subject}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {item.reason}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {briefing.data.deadlines.length > 0 && (
              <div className="mt-3 border-t border-border pt-2">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Deadlines
                </p>
                {briefing.data.deadlines.map((d, i) => (
                  <p key={i} className="text-xs leading-5">
                    {d.text}
                    {d.due !== null && (
                      <span className="ml-1.5 text-[11px] text-amber-500">{d.due}</span>
                    )}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {reminders.data !== undefined && reminders.data.length > 0 && (
        <Card title="Follow-ups">
          <ul className="space-y-2">
            {reminders.data.map((reminder) => (
              <li key={reminder.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => select(reminder.threadId)}
                  className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left hover:bg-surface-muted"
                >
                  <span className="block truncate text-xs font-medium">
                    {reminder.subject}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {reminder.reason}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss reminder for ${reminder.subject}`}
                  onClick={() => {
                    void dismissReminder(reminder.id).then(() =>
                      queryClient.invalidateQueries({
                        queryKey: ["ai", "reminders"],
                      }),
                    );
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function AiPanel() {
  const { aiPanelOpen, toggleAiPanel } = useUi();
  const { selectedId } = useMailSelection();
  const { data: thread } = useThread(selectedId);
  const overlay = useMediaQuery("(max-width: 1279px)");

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
            overlay && "fixed right-0 top-0 z-20 bg-chrome pl-3 shadow-2xl",
          )}
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleAiPanel}
              aria-label="Close AI panel"
              className="rounded-md p-1 text-chrome-muted hover:text-chrome-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          {thread !== undefined && selectedId !== null ? (
            <ThreadAssistant thread={thread} />
          ) : (
            <DailyBriefing />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
