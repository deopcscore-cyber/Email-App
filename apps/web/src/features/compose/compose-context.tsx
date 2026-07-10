"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  Address,
  ComposeMode,
  DraftDto,
  ThreadDetailDto,
} from "@novamail/shared";
import { toast } from "sonner";
import { useSession } from "@/features/auth/use-session";
import { createDraft } from "./api/compose.api";

function quoteForForward(thread: ThreadDetailDto): string {
  const last = thread.messages[thread.messages.length - 1];
  if (last === undefined) return "";
  const from = last.from.name ?? last.from.email;
  const body = last.bodyHtml ?? `<p>${(last.bodyText ?? "").replace(/\n/g, "<br>")}</p>`;
  return (
    `<p></p><p>---------- Forwarded message ----------<br>` +
    `From: ${from} &lt;${last.from.email}&gt;<br>` +
    `Subject: ${thread.subject}</p>` +
    body
  );
}

interface ComposeContextValue {
  draft: DraftDto | null;
  isOpen: boolean;
  openNew: () => void;
  openFromThread: (
    thread: ThreadDetailDto,
    mode: Exclude<ComposeMode, "new">,
    options?: { bodyHtml?: string },
  ) => void;
  reopenDraft: (draft: DraftDto) => void;
  close: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function ComposeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useSession();
  const [draft, setDraft] = useState<DraftDto | null>(null);

  const accountId = user?.accounts[0]?.id;
  const myEmail = user?.accounts[0]?.email;

  const create = useCallback(
    async (
      input: Omit<Parameters<typeof createDraft>[0], "accountId">,
    ): Promise<void> => {
      if (accountId === undefined) {
        toast.error("Connect an email account first");
        return;
      }
      try {
        const created = await createDraft({ ...input, accountId });
        setDraft(created);
      } catch {
        toast.error("Couldn't create the draft. Try again.");
      }
    },
    [accountId],
  );

  const openNew = useCallback(() => {
    void create({ mode: "new", to: [], cc: [], bcc: [], subject: "", bodyHtml: "" });
  }, [create]);

  const openFromThread = useCallback(
    (
      thread: ThreadDetailDto,
      mode: Exclude<ComposeMode, "new">,
      options?: { bodyHtml?: string },
    ) => {
      const last = thread.messages[thread.messages.length - 1];
      if (last === undefined) return;

      if (mode === "forward") {
        void create({
          mode: "forward",
          to: [],
          cc: [],
          bcc: [],
          subject: thread.subject.startsWith("Fwd:")
            ? thread.subject
            : `Fwd: ${thread.subject}`,
          bodyHtml: options?.bodyHtml ?? quoteForForward(thread),
        });
        return;
      }

      // Reply goes to the last counterparty; reply-all keeps everyone but me.
      const to: Address[] =
        last.from.email === myEmail ? last.to : [last.from];
      const cc: Address[] =
        mode === "replyAll"
          ? [...last.to, ...last.cc].filter(
              (a) => a.email !== myEmail && a.email !== to[0]?.email,
            )
          : [];
      void create({
        mode,
        replyToMessageId: last.id,
        to,
        cc,
        bcc: [],
        subject: thread.subject.startsWith("Re:")
          ? thread.subject
          : `Re: ${thread.subject}`,
        bodyHtml: options?.bodyHtml ?? "",
      });
    },
    [create, myEmail],
  );

  const reopenDraft = useCallback((d: DraftDto) => setDraft(d), []);
  const close = useCallback(() => setDraft(null), []);

  const value = useMemo<ComposeContextValue>(
    () => ({
      draft,
      isOpen: draft !== null,
      openNew,
      openFromThread,
      reopenDraft,
      close,
    }),
    [draft, openNew, openFromThread, reopenDraft, close],
  );

  return (
    <ComposeContext.Provider value={value}>{children}</ComposeContext.Provider>
  );
}

export function useCompose(): ComposeContextValue {
  const ctx = useContext(ComposeContext);
  if (ctx === null) {
    throw new Error("useCompose must be used within ComposeProvider");
  }
  return ctx;
}
