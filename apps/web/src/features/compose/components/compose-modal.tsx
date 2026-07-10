"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  FileText,
  Paperclip,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Address, DraftDto } from "@novamail/shared";
import { useQueryClient } from "@tanstack/react-query";
import { threadKeys } from "@/features/mail-list/hooks/use-threads";
import {
  useOverlayScope,
  useShortcut,
} from "@/features/shortcuts/use-shortcut";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteDraft,
  removeAttachment,
  sendDraft,
  undoSend,
  updateDraft,
  uploadAttachment,
} from "../api/compose.api";
import { useCompose } from "../compose-context";
import { Editor } from "./editor";
import { RecipientField } from "./recipient-field";
import { RewriteMenu } from "./rewrite-menu";

const AUTOSAVE_MS = 1_500;

function scheduleOptions(): { label: string; at: Date }[] {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  const inThreeHours = new Date(now.getTime() + 3 * 3600_000);
  return [
    { label: "In 3 hours", at: inThreeHours },
    { label: "Tomorrow 8:00 AM", at: tomorrow },
    { label: "Monday 9:00 AM", at: monday },
  ];
}

export function ComposeModal() {
  const { draft, isOpen, close, reopenDraft } = useCompose();
  const queryClient = useQueryClient();

  useOverlayScope(isOpen);
  useShortcut("escape", () => saveAndClose(), {
    scope: "overlay",
    enabled: isOpen,
  });

  // Local field state, seeded from the server draft.
  const [to, setTo] = useState<Address[]>([]);
  const [cc, setCc] = useState<Address[]>([]);
  const [bcc, setBcc] = useState<Address[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<DraftDto["attachments"]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Bumped when AI rewrites the body so the editor remounts with new content.
  const [editorVersion, setEditorVersion] = useState(0);

  const draftId = draft?.id ?? null;
  const dirtyRef = useRef(false);
  const stateRef = useRef({ to, cc, bcc, subject, bodyHtml });
  stateRef.current = { to, cc, bcc, subject, bodyHtml };

  useEffect(() => {
    if (draft !== null) {
      setTo(draft.to);
      setCc(draft.cc);
      setBcc(draft.bcc);
      setShowCcBcc(draft.cc.length > 0 || draft.bcc.length > 0);
      setSubject(draft.subject);
      setBodyHtml(draft.bodyHtml);
      setAttachments(draft.attachments);
      setSaveState("idle");
      dirtyRef.current = false;
    }
  }, [draft]);

  const persist = useCallback(async (): Promise<void> => {
    if (draftId === null || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      await updateDraft(draftId, stateRef.current);
      setSaveState("saved");
      void queryClient.invalidateQueries({ queryKey: threadKeys.counts });
    } catch {
      setSaveState("idle");
    }
  }, [draftId, queryClient]);

  // Debounced autosave whenever fields change.
  useEffect(() => {
    if (draftId === null) return;
    dirtyRef.current = true;
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [to, cc, bcc, subject, bodyHtml, draftId, persist]);

  const saveAndClose = (): void => {
    void persist();
    close();
    void queryClient.invalidateQueries({ queryKey: [...threadKeys.all, "list"] });
  };

  const discard = (): void => {
    if (draftId !== null) {
      void deleteDraft(draftId).then(() => {
        void queryClient.invalidateQueries({ queryKey: threadKeys.all });
      });
    }
    close();
  };

  const onFiles = async (files: FileList | File[]): Promise<void> => {
    if (draftId === null) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadAttachment(draftId, file);
        setAttachments((prev) => [...prev, uploaded]);
      }
    } catch {
      toast.error("Attachment upload failed");
    } finally {
      setUploading(false);
    }
  };

  const doSend = async (scheduledAt?: Date): Promise<void> => {
    if (draftId === null) return;
    if (to.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    await persist();
    try {
      const result = await sendDraft(draftId, scheduledAt?.toISOString());
      const snapshot = draftId;
      close();
      void queryClient.invalidateQueries({ queryKey: threadKeys.all });

      if (scheduledAt !== undefined) {
        toast.success(
          `Scheduled for ${scheduledAt.toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}`,
        );
        return;
      }
      const undoMs = Math.max(
        new Date(result.dispatchAt).getTime() - Date.now(),
        0,
      );
      toast("Sending…", {
        id: `send-${snapshot}`,
        duration: undoMs,
        action: {
          label: "Undo",
          onClick: () => {
            void undoSend(snapshot)
              .then((restored) => {
                reopenDraft(restored);
                toast.dismiss(`send-${snapshot}`);
              })
              .catch(() => toast.error("Too late — already sent"));
          },
        },
      });
    } catch {
      toast.error("Send failed. The draft is safe.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && draft !== null && (
        <motion.div
          role="dialog"
          aria-label={draft.mode === "new" ? "New message" : "Reply"}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer.files);
          }}
          className="fixed bottom-4 right-4 z-30 flex max-h-[85vh] w-[560px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl max-md:inset-x-2 max-md:bottom-2 max-md:w-auto"
        >
          {/* Drag overlay */}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80">
              <span className="flex items-center gap-2 text-sm font-medium text-accent">
                <UploadCloud className="size-5" aria-hidden />
                Drop files to attach
              </span>
            </div>
          )}

          <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">
              {draft.mode === "new"
                ? "New message"
                : draft.mode === "forward"
                  ? "Forward"
                  : "Reply"}
            </h2>
            <span className="ml-2 text-[11px] text-muted-foreground" aria-live="polite">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : ""}
            </span>
            <button
              type="button"
              aria-label="Discard draft"
              title="Discard draft"
              onClick={discard}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Save and close"
              onClick={saveAndClose}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <RecipientField
              label="To"
              value={to}
              onChange={setTo}
              autoFocus={draft.mode !== "new" ? false : true}
              trailing={
                !showCcBcc ? (
                  <button
                    type="button"
                    onClick={() => setShowCcBcc(true)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Cc/Bcc
                  </button>
                ) : undefined
              }
            />
            {showCcBcc && (
              <>
                <RecipientField label="Cc" value={cc} onChange={setCc} />
                <RecipientField label="Bcc" value={bcc} onChange={setBcc} />
              </>
            )}
            <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px]">
              <span className="w-12 shrink-0 text-muted-foreground">Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 bg-transparent outline-none"
              />
            </label>

            <Editor
              key={`${draft.id}:${editorVersion}`}
              initialHtml={editorVersion === 0 ? draft.bodyHtml : bodyHtml}
              onChange={setBodyHtml}
              onSubmit={() => void doSend()}
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-xs"
                  >
                    <FileText className="size-3.5 text-accent" aria-hidden />
                    <span className="max-w-40 truncate font-medium">{a.filename}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(a.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.filename}`}
                      onClick={() => {
                        if (draftId !== null) {
                          void removeAttachment(draftId, a.id);
                          setAttachments((prev) =>
                            prev.filter((x) => x.id !== a.id),
                          );
                        }
                      }}
                      className="rounded p-0.5 text-muted-foreground hover:text-danger"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <footer className="relative flex items-center gap-1 border-t border-border px-3 py-2.5">
            <div className="flex overflow-hidden rounded-xl shadow-[0_4px_16px_-6px_rgba(124,92,252,0.5)]">
              <button
                type="button"
                onClick={() => void doSend()}
                className="flex items-center gap-2 bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-4 py-2 text-[13px] font-medium text-white transition-[filter] hover:brightness-110"
              >
                <Send className="size-3.5" aria-hidden />
                Send
              </button>
              <button
                type="button"
                aria-label="Schedule send"
                aria-expanded={scheduleOpen}
                onClick={() => setScheduleOpen((v) => !v)}
                className="border-l border-white/20 bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] px-2 text-white transition-[filter] hover:brightness-110"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>

            {scheduleOpen && (
              <div className="absolute bottom-14 left-3 z-20 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl">
                <p className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden />
                  Schedule send
                </p>
                {scheduleOptions().map(({ label, at }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setScheduleOpen(false);
                      void doSend(at);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-surface-muted"
                  >
                    {label}
                    <span className="text-[11px] text-muted-foreground">
                      {at.toLocaleDateString(undefined, {
                        weekday: "short",
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <RewriteMenu
              draftId={draft.id}
              currentBody={bodyHtml}
              onRewritten={(html) => {
                setBodyHtml(html);
                setEditorVersion((v) => v + 1);
              }}
            />

            <label
              className={cn(
                "ml-1 cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
                uploading && "animate-pulse",
              )}
              title="Attach files"
            >
              <Paperclip className="size-4" aria-hidden />
              <input
                type="file"
                multiple
                className="sr-only"
                aria-label="Attach files"
                onChange={(e) => {
                  if (e.target.files !== null) void onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="ml-auto text-[11px] text-muted-foreground">
              ⌘↵ to send
            </span>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
