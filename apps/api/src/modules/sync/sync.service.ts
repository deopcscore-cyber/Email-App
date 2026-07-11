import { Injectable, Logger } from "@nestjs/common";
import type { EmailAccount, Prisma } from "@prisma/client";
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
  ) {}

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
        await this.recomputeThread(existing.threadId);
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

    await this.recomputeThread(thread.id, msg.folder);
    return { threadId: thread.id, isNewInboxMessage };
  }

  /** Recomputes denormalized thread fields from its messages. */
  private async recomputeThread(
    threadId: string,
    latestFolder?: ProviderMessage["folder"],
  ): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { receivedAt: "desc" },
      select: {
        fromAddress: true,
        snippet: true,
        isRead: true,
        receivedAt: true,
        attachments: { select: { id: true }, take: 1 },
      },
    });
    if (messages.length === 0) {
      await this.prisma.thread.delete({ where: { id: threadId } });
      return;
    }
    const latest = messages[0] as (typeof messages)[number];
    const participants = [
      ...new Map(
        messages
          .map((m) => m.fromAddress as { name: string | null; email: string })
          .map((a) => [a.email, a]),
      ).values(),
    ];

    await this.prisma.thread.update({
      where: { id: threadId },
      data: {
        snippet: latest.snippet,
        participants: participants as Prisma.InputJsonValue[],
        messageCount: messages.length,
        unreadCount: messages.filter((m) => !m.isRead).length,
        hasAttachments: messages.some((m) => m.attachments.length > 0),
        lastMessageAt: latest.receivedAt,
        ...(latestFolder !== undefined && { folder: latestFolder }),
      },
    });
  }
}
