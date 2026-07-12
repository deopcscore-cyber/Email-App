import { Injectable, Logger } from "@nestjs/common";
import type { Category, EmailAccount, Folder, Prisma } from "@prisma/client";
import type { Address } from "@novamail/shared";
import { QueueService } from "../../jobs/queue.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EventsService } from "../events/events.service";
import { PushService } from "../push/push.service";
import { GmailProvider } from "./providers/gmail.provider";
import { GraphProvider } from "./providers/graph.provider";
import type {
  MailProvider,
  ProviderMessage,
} from "./providers/provider.interface";
import { TokenBrokerService } from "./token-broker.service";

/** Accounts created by the dev seed have no real provider behind them. */
export function isSeedAccount(account: { encryptedRefreshToken: string }): boolean {
  return account.encryptedRefreshToken.startsWith("seed-");
}

// Automated/bulk senders (newsletters, receipts, notifications) that should
// never land in Focused even when they happen to address the account
// directly -- these prefixes are near-universal across ESPs and ticketing
// systems, so a false negative here is far more likely than a false positive.
const BULK_SENDER_PATTERN =
  /^(no-?reply|do-?not-?reply|notifications?|newsletter|bounces?|mailer-daemon|digest|updates?|marketing|automated|alerts?)@/i;

/**
 * Heuristic "Focused" classifier: no per-message LLM call (too slow/costly
 * for a 2k-message backfill), just the two signals real priority-inbox
 * implementations lean on most -- addressed directly (not just cc'd) to a
 * human-looking sender.
 */
function isLikelyFocused(accountEmail: string, from: Address, to: Address[]): boolean {
  const directlyAddressed = to.some(
    (a) => a.email.toLowerCase() === accountEmail.toLowerCase(),
  );
  return directlyAddressed && !BULK_SENDER_PATTERN.test(from.email);
}

// Domains social platforms send account notifications from -- covers the
// major ones; an unmatched social sender just falls into Primary, which is
// a safe default rather than a broken one.
const SOCIAL_DOMAINS = [
  "facebookmail.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "reddit.com",
  "snapchat.com",
  "discord.com",
  "threads.net",
  "meetup.com",
];

/**
 * Heuristic Gmail-style category classifier -- same no-LLM-per-message
 * constraint as isLikelyFocused. Social is a domain allowlist (these
 * senders are consistent enough to match reliably); Promotions reuses the
 * bulk-sender pattern already proven out for Focused/Other. Everything
 * else is Primary, which is the safe default for a heuristic that will
 * always miss some real newsletters and social mentions.
 */
function classifyCategory(from: Address): Category {
  const domain = from.email.split("@")[1]?.toLowerCase() ?? "";
  if (SOCIAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return "SOCIAL";
  }
  if (BULK_SENDER_PATTERN.test(from.email)) {
    return "PROMOTIONS";
  }
  return "PRIMARY";
}

// Higher wins when a thread's messages disagree on folder -- e.g. an inbound
// message (INBOX) and your own reply to it (SENT) belong to the same thread,
// and the thread must stay in Inbox rather than getting reclassified as Sent
// just because the reply was the most recently synced message.
const FOLDER_PRIORITY: Record<Folder, number> = {
  TRASH: 5,
  SPAM: 4,
  INBOX: 3,
  DRAFTS: 2,
  SENT: 1,
  ARCHIVE: 0,
};

/** Aggregates a thread's folder from its messages' provider-synced folders.
 * Returns undefined when none are known yet (e.g. only local drafts). */
export function effectiveThreadFolder(
  folders: (Folder | null)[],
): Folder | undefined {
  const known = folders.filter((f): f is Folder => f !== null);
  if (known.length === 0) return undefined;
  return known.reduce((best, f) =>
    FOLDER_PRIORITY[f] > FOLDER_PRIORITY[best] ? f : best,
  );
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly push: PushService,
    private readonly broker: TokenBrokerService,
    private readonly gmail: GmailProvider,
    private readonly graph: GraphProvider,
    private readonly queues: QueueService,
  ) {}

  /**
   * Fans out a delta sync to every connected mailbox. Gmail/Graph push
   * notifications need a registered subscription (Pub/Sub topic + domain
   * verification, or a Graph /subscriptions resource) that this app never
   * sets up, so without this, new mail would only ever appear on the
   * one-time backfill from connecting/reconnecting an account. Called on a
   * fixed interval (see worker.ts) rather than that push infrastructure --
   * simpler to run reliably, and delta's history-based fetch is cheap
   * enough that polling every couple of minutes is not a real cost concern.
   */
  async pollAll(): Promise<void> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        syncStatus: { in: ["ACTIVE", "ERROR"] },
        encryptedRefreshToken: { not: { startsWith: "seed-" } },
      },
      select: { id: true, syncCursor: true },
    });
    for (const account of accounts) {
      // An account can end up ACTIVE/ERROR with no cursor if a backfill
      // never finished (crashed worker, exhausted retries) -- delta is a
      // no-op without one, which would otherwise strand it silently. Retry
      // the backfill instead so a transient failure self-heals.
      const kind = account.syncCursor === null ? "backfill" : "delta";
      await this.queues.enqueue(
        "sync",
        { kind, accountId: account.id },
        { jobId: `${kind}-${account.id}-${Math.floor(Date.now() / 60_000)}` },
      );
    }
  }

  providerFor(account: Pick<EmailAccount, "provider">): MailProvider {
    return account.provider === "GOOGLE" ? this.gmail : this.graph;
  }

  /** Initial import after connecting an account; idempotent via upserts. */
  async backfill(accountId: string): Promise<void> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (isSeedAccount(account)) return;

    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { syncStatus: "BACKFILLING" },
    });

    // A failure partway through must not leave the account stuck in
    // BACKFILLING forever -- pollAll only retries ACTIVE/ERROR accounts, so
    // an uncaught throw here would silently and permanently stop sync.
    try {
      const provider = this.providerFor(account);
      const accessToken = await this.broker.accessTokenFor(accountId);
      // Cursor first: changes that arrive during backfill are replayed by delta.
      const cursor = await provider.currentCursor(accessToken);

      let pageToken: string | undefined;
      let imported = 0;
      const MAX_BACKFILL = 2_000;
      do {
        const page = await provider.listMessages(accessToken, pageToken);
        for (const msg of page.messages) {
          await this.upsertMessage(account, msg);
        }
        imported += page.messages.length;
        pageToken = page.nextPageToken ?? undefined;

        await this.events.publish(account.userId, {
          type: "sync.progress",
          accountId,
          percent: Math.min(99, Math.round((imported / MAX_BACKFILL) * 100)),
        });
        await this.events.publish(account.userId, {
          type: "mail.updated",
          threadIds: [],
        });
      } while (pageToken !== undefined && imported < MAX_BACKFILL);

      await this.prisma.emailAccount.update({
        where: { id: accountId },
        data: {
          syncStatus: "ACTIVE",
          syncCursor: cursor,
          lastSyncedAt: new Date(),
        },
      });
      await this.events.publish(account.userId, {
        type: "sync.progress",
        accountId,
        percent: 100,
      });
      this.logger.log(`Backfilled ${imported} messages for ${account.email}`);
    } catch (err) {
      await this.prisma.emailAccount.update({
        where: { id: accountId },
        data: { syncStatus: "ERROR" },
      });
      throw err;
    }
  }

  /** Replays provider changes since the stored cursor. */
  async delta(accountId: string): Promise<void> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (isSeedAccount(account) || account.syncCursor === null) return;

    const provider = this.providerFor(account);
    const accessToken = await this.broker.accessTokenFor(accountId);
    const result = await provider.fetchDelta(accessToken, account.syncCursor);

    if (result.cursorExpired) {
      this.logger.warn(`Cursor expired for ${account.email}; full resync`);
      await this.backfill(accountId);
      return;
    }

    const touchedThreads = new Set<string>();
    for (const msg of result.changed) {
      const { threadId, isNewInboxMessage } = await this.upsertMessage(
        account,
        msg,
      );
      touchedThreads.add(threadId);
      if (isNewInboxMessage) {
        const fromName = msg.from.name ?? msg.from.email;
        await this.events.publish(account.userId, {
          type: "mail.received",
          threadId,
          subject: msg.subject,
          fromName,
        });
        // Push reaches the user even with the tab closed; SSE only reaches
        // it open. Best-effort -- a dead/expired subscription is pruned
        // inside PushService, never blocks sync.
        await this.push.sendToUser(account.userId, {
          title: fromName,
          body: msg.subject,
          url: `/inbox`,
        });
      }
    }
    for (const providerMessageId of result.deletedIds) {
      const existing = await this.prisma.message.findUnique({
        where: {
          accountId_providerMessageId: { accountId, providerMessageId },
        },
        select: { id: true, threadId: true },
      });
      if (existing !== null) {
        await this.prisma.message.delete({ where: { id: existing.id } });
        touchedThreads.add(existing.threadId);
        await this.recomputeThread(existing.threadId, account.email);
      }
    }

    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { syncCursor: result.newCursor, lastSyncedAt: new Date() },
    });
    if (touchedThreads.size > 0) {
      await this.events.publish(account.userId, {
        type: "mail.updated",
        threadIds: [...touchedThreads],
      });
    }
  }

  /** Mirrors a local triage change onto the provider. */
  async writeback(
    accountId: string,
    threadId: string,
    action: {
      isRead?: boolean;
      isStarred?: boolean;
      folder?: string;
      snoozedUntil?: string | null;
    },
  ): Promise<void> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (isSeedAccount(account)) return;

    const messages = await this.prisma.message.findMany({
      where: { threadId, providerMessageId: { not: null } },
      select: { providerMessageId: true },
    });
    const ids = messages
      .map((m) => m.providerMessageId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return;

    // Snooze has no provider equivalent — archive there; we restore on wake.
    const folder =
      action.snoozedUntil !== undefined && action.snoozedUntil !== null
        ? "ARCHIVE"
        : action.snoozedUntil === null
          ? "INBOX"
          : action.folder;

    const provider = this.providerFor(account);
    const accessToken = await this.broker.accessTokenFor(accountId);
    await provider.applyTriage(accessToken, ids, {
      isRead: action.isRead,
      isStarred: action.isStarred,
      folder,
    });
  }

  /** Upserts one provider message and its thread. Returns local thread id. */
  private async upsertMessage(
    account: EmailAccount,
    msg: ProviderMessage,
  ): Promise<{ threadId: string; isNewInboxMessage: boolean }> {
    const existing = await this.prisma.message.findUnique({
      where: {
        accountId_providerMessageId: {
          accountId: account.id,
          providerMessageId: msg.providerMessageId,
        },
      },
      select: { id: true },
    });
    const isNewInboxMessage =
      existing === null &&
      msg.folder === "INBOX" &&
      msg.from.email !== account.email;

    const thread = await this.prisma.thread.upsert({
      where: {
        accountId_providerThreadId: {
          accountId: account.id,
          providerThreadId: msg.providerThreadId,
        },
      },
      create: {
        accountId: account.id,
        providerThreadId: msg.providerThreadId,
        subject: msg.subject,
        snippet: msg.snippet,
        folder: msg.folder,
        participants: [msg.from] as Prisma.InputJsonValue,
        lastMessageAt: msg.receivedAt,
        isStarred: msg.isStarred,
        hasAttachments: msg.attachments.length > 0,
      },
      update: {},
    });

    await this.prisma.message.upsert({
      where: {
        accountId_providerMessageId: {
          accountId: account.id,
          providerMessageId: msg.providerMessageId,
        },
      },
      create: {
        threadId: thread.id,
        accountId: account.id,
        providerMessageId: msg.providerMessageId,
        internetMessageId: msg.internetMessageId,
        folder: msg.folder,
        fromAddress: msg.from as Prisma.InputJsonValue,
        toAddresses: msg.to as Prisma.InputJsonValue[],
        ccAddresses: msg.cc as Prisma.InputJsonValue[],
        subject: msg.subject,
        snippet: msg.snippet,
        bodyHtml: msg.bodyHtml,
        bodyText: msg.bodyText,
        isRead: msg.isRead,
        receivedAt: msg.receivedAt,
        sendStatus: msg.folder === "DRAFTS" ? "DRAFT" : "NONE",
        attachments: {
          create: msg.attachments.map((a) => ({
            providerAttachmentId: a.providerAttachmentId,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            isInline: a.isInline,
            contentId: a.contentId,
          })),
        },
      },
      update: {
        isRead: msg.isRead,
        bodyHtml: msg.bodyHtml,
        bodyText: msg.bodyText,
        folder: msg.folder,
        ...(msg.internetMessageId !== null && {
          internetMessageId: msg.internetMessageId,
        }),
      },
    });

    // Track contacts for autocomplete ranking.
    await this.prisma.contact.upsert({
      where: {
        accountId_email: { accountId: account.id, email: msg.from.email },
      },
      create: {
        accountId: account.id,
        email: msg.from.email,
        name: msg.from.name ?? null,
        interactions: 1,
        lastInteracted: msg.receivedAt,
      },
      update: {
        interactions: { increment: 1 },
        lastInteracted: msg.receivedAt,
        ...(msg.from.name != null && { name: msg.from.name }),
      },
    });

    await this.recomputeThread(thread.id, account.email);
    return { threadId: thread.id, isNewInboxMessage };
  }

  /** Recomputes denormalized thread fields from its messages. */
  private async recomputeThread(
    threadId: string,
    accountEmail: string,
  ): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { receivedAt: "desc" },
      select: {
        fromAddress: true,
        toAddresses: true,
        snippet: true,
        isRead: true,
        receivedAt: true,
        folder: true,
        attachments: { select: { id: true }, take: 1 },
      },
    });
    if (messages.length === 0) {
      await this.prisma.thread.delete({ where: { id: threadId } });
      return;
    }
    const latest = messages[0] as (typeof messages)[number];
    // The message that actually decides Focused/Other: if you replied last,
    // `latest` is your own outgoing message, whose `to` is the correspondent
    // rather than you -- classifying off that made almost every thread you
    // engage with fall out of Focused. Prefer the newest message that isn't
    // from the account owner; only an all-outgoing thread falls back to
    // `latest`.
    const latestInbound =
      messages.find(
        (m) =>
          (m.fromAddress as Address).email.toLowerCase() !==
          accountEmail.toLowerCase(),
      ) ?? latest;
    // Counterparties first so the list row shows "who this is with", not the
    // account owner -- messages are newest-first, so without this sort a
    // thread you replied to last shows your own name/avatar in the list.
    const participants = [
      ...new Map(
        messages
          .map((m) => m.fromAddress as { name: string | null; email: string })
          .map((a) => [a.email, a]),
      ).values(),
    ].sort(
      (a, b) =>
        (a.email.toLowerCase() === accountEmail.toLowerCase() ? 1 : 0) -
        (b.email.toLowerCase() === accountEmail.toLowerCase() ? 1 : 0),
    );

    await this.prisma.thread.update({
      where: { id: threadId },
      data: {
        snippet: latest.snippet,
        participants: participants as Prisma.InputJsonValue[],
        messageCount: messages.length,
        unreadCount: messages.filter((m) => !m.isRead).length,
        hasAttachments: messages.some((m) => m.attachments.length > 0),
        lastMessageAt: latest.receivedAt,
        isPriority: isLikelyFocused(
          accountEmail,
          latestInbound.fromAddress as Address,
          latestInbound.toAddresses as Address[],
        ),
        category: classifyCategory(latestInbound.fromAddress as Address),
        ...((): { folder?: Folder } => {
          const folder = effectiveThreadFolder(messages.map((m) => m.folder));
          return folder !== undefined ? { folder } : {};
        })(),
      },
    });
  }
}
