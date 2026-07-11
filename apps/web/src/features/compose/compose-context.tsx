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
  EmailAccountDto,
  ThreadDetailDto,
} from "@novamail/shared";
import { toast } from "sonner";
import { useSession } from "@/features/auth/use-session";
import { createDraft, deleteDraft } from "./api/compose.api";

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

interface ComposeFields {
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  bodyHtml: string;
}

interface ComposeContextValue {
  draft: DraftDto | null;
  isOpen: boolean;
  accounts: EmailAccountDto[];
  openNew: (accountId?: string) => void;
  openFromThread: (
    thread: ThreadDetailDto,
    mode: Exclude<ComposeMode, "new">,
    options?: { bodyHtml?: string },
  ) => void;
  /** Recreates the current "new" draft under a different sending account,
   * preserving whatever the user has typed so far. Replies/forwards are
   * pinned to the thread's own account and never offer this. */
  switchFromAccount: (accountId: string, fields: ComposeFields) => void;
  reopenDraft: (draft: DraftDto) => void;
  close: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function ComposeProvider({ children }: { children: React.ReactNode }) {
  const { data: user } = useSession();
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const accounts = useMemo(() => user?.accounts ?? [], [user]);

  const defaultAccountId = accounts[0]?.id;

  const create = useCallback(
    async (
      input: Omit<Parameters<typeof createDraft>[0], "accountId"> & {
        accountId?: string;
      },
    ): Promise<void> => {
      const accountId = input.accountId ?? defaultAccountId;
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
    [defaultAccountId],
  );

  const openNew = useCallback(
    (accountId?: string) => {
      void create({
        mode: "new",
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        bodyHtml: "",
        accountId,
      });
    },
    [create],
  );

  const switchFromAccount = useCallback(
    (accountId: string, fields: ComposeFields) => {
      const previousId = draft?.id;
      void create({ mode: "new", ...fields, accountId }).then(() => {
        if (previousId !== undefined) void deleteDraft(previousId);
      });
    },
    [create, draft?.id],
  );

  const openFromThread = useCallback(
    (
      thread: ThreadDetailDto,
      mode: Exclude<ComposeMode, "new">,
      options?: { bodyHtml?: string },
    ) => {
      const last = thread.messages[thread.messages.length - 1];
      if (last === undefined) return;

      // The reply must go out from the mailbox the thread lives in, not
      // whichever account happens to be first — otherwise "me" in the
      // recipient math below is wrong for every account but the first.
      const threadAccount = accounts.find((a) => a.id === thread.accountId);
      const myEmail = threadAccount?.email;

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
          accountId: thread.accountId,
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
        accountId: thread.accountId,
      });
    },
    [create, accounts],
  );

  const reopenDraft = useCallback((d: DraftDto) => setDraft(d), []);
  const close = useCallback(() => setDraft(null), []);

  const value = useMemo<ComposeContextValue>(
    () => ({
      draft,
      isOpen: draft !== null,
      accounts,
      openNew,
      openFromThread,
      switchFromAccount,
      reopenDraft,
      close,
    }),
    [draft, accounts, openNew, openFromThread, switchFromAccount, reopenDraft, close],
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
