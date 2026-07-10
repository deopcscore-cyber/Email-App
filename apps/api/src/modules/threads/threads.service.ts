import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  Address,
  LabelDto,
  MailView,
  MessageDto,
  ThreadCountsDto,
  ThreadDetailDto,
  ThreadListItemDto,
  ThreadPageDto,
  TriagePatchDto,
} from "@novamail/shared";
import { PrismaService } from "../../prisma/prisma.service";

const PAGE_SIZE = 50;

interface Cursor {
  t: string; // lastMessageAt ISO
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Cursor;
    return typeof parsed.t === "string" && typeof parsed.id === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

type ThreadWithLabels = Prisma.ThreadGetPayload<{
  include: {
    labels: { include: { label: true } };
    account: { select: { color: true } };
  };
}>;

@Injectable()
export class ThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Where-clause for a sidebar view, scoped to the user's accounts. */
  private viewWhere(
    userId: string,
    view: MailView,
    accountId?: string,
  ): Prisma.ThreadWhereInput {
    const scope: Prisma.ThreadWhereInput =
      accountId !== undefined
        ? { accountId, account: { userId } }
        : { account: { userId } };

    switch (view) {
      case "inbox":
        return { ...scope, folder: "INBOX", snoozedUntil: null };
      case "priority":
        return {
          ...scope,
          isPriority: true,
          folder: { notIn: ["TRASH", "SPAM"] },
        };
      case "snoozed":
        return { ...scope, snoozedUntil: { not: null } };
      case "starred":
        return { ...scope, isStarred: true, folder: { not: "TRASH" } };
      case "sent":
        return { ...scope, folder: "SENT" };
      case "drafts":
        return { ...scope, folder: "DRAFTS" };
      case "spam":
        return { ...scope, folder: "SPAM" };
      case "trash":
        return { ...scope, folder: "TRASH" };
    }
  }

  async list(
    userId: string,
    view: MailView,
    options: {
      tab?: "focused" | "other";
      cursor?: string;
      accountId?: string;
      labelId?: string;
    },
  ): Promise<ThreadPageDto> {
    const where = this.viewWhere(userId, view, options.accountId);
    if (view === "inbox" && options.tab !== undefined) {
      where.isPriority = options.tab === "focused";
    }
    if (options.labelId !== undefined) {
      where.labels = { some: { labelId: options.labelId } };
    }

    const cursor =
      options.cursor !== undefined ? decodeCursor(options.cursor) : null;
    if (cursor !== null) {
      // Tuple comparison (lastMessageAt, id) keeps pagination stable while
      // new mail arrives above the cursor.
      where.OR = [
        { lastMessageAt: { lt: new Date(cursor.t) } },
        { lastMessageAt: new Date(cursor.t), id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.thread.findMany({
      where,
      orderBy: [
        { isPinned: "desc" },
        { lastMessageAt: "desc" },
        { id: "desc" },
      ],
      take: PAGE_SIZE + 1,
      include: {
        labels: { include: { label: true } },
        account: { select: { color: true } },
      },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE);
    const last = items[items.length - 1];
    return {
      items: items.map((t) => this.toListItem(t)),
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({ t: last.lastMessageAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(userId: string, threadId: string): Promise<ThreadDetailDto> {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, account: { userId } },
      include: {
        labels: { include: { label: true } },
        account: { select: { color: true } },
        messages: {
          orderBy: { receivedAt: "asc" },
          include: { attachments: true },
        },
      },
    });
    if (thread === null) {
      throw new NotFoundException("Thread not found");
    }
    return {
      ...this.toListItem(thread),
      messages: thread.messages.map(
        (m): MessageDto => ({
          id: m.id,
          from: m.fromAddress as Address,
          to: m.toAddresses as Address[],
          cc: m.ccAddresses as Address[],
          snippet: m.snippet,
          bodyHtml: m.bodyHtml,
          bodyText: m.bodyText,
          isRead: m.isRead,
          receivedAt: m.receivedAt.toISOString(),
          attachments: m.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            isInline: a.isInline,
          })),
        }),
      ),
    };
  }

  async patch(
    userId: string,
    threadId: string,
    patch: TriagePatchDto,
  ): Promise<ThreadListItemDto> {
    const existing = await this.prisma.thread.findFirst({
      where: { id: threadId, account: { userId } },
      select: { id: true },
    });
    if (existing === null) {
      throw new NotFoundException("Thread not found");
    }

    const data: Prisma.ThreadUpdateInput = {
      ...(patch.isStarred !== undefined && { isStarred: patch.isStarred }),
      ...(patch.isPinned !== undefined && { isPinned: patch.isPinned }),
      ...(patch.folder !== undefined && { folder: patch.folder }),
      ...(patch.snoozedUntil !== undefined && {
        snoozedUntil:
          patch.snoozedUntil === null ? null : new Date(patch.snoozedUntil),
      }),
      ...(patch.isRead !== undefined && {
        unreadCount: patch.isRead ? 0 : 1,
      }),
    };

    const updated = await this.prisma.thread.update({
      where: { id: threadId },
      data,
      include: {
        labels: { include: { label: true } },
        account: { select: { color: true } },
      },
    });
    if (patch.isRead !== undefined) {
      await this.prisma.message.updateMany({
        where: { threadId },
        data: { isRead: patch.isRead },
      });
    }
    // Phase 4: enqueue sync:writeback to mirror this change to the provider.
    return this.toListItem(updated);
  }

  async counts(userId: string): Promise<ThreadCountsDto> {
    const [inbox, drafts, snoozed, spam] = await Promise.all([
      this.prisma.thread.count({
        where: {
          account: { userId },
          folder: "INBOX",
          snoozedUntil: null,
          unreadCount: { gt: 0 },
        },
      }),
      this.prisma.thread.count({
        where: { account: { userId }, folder: "DRAFTS" },
      }),
      this.prisma.thread.count({
        where: { account: { userId }, snoozedUntil: { not: null } },
      }),
      this.prisma.thread.count({
        where: {
          account: { userId },
          folder: "SPAM",
          unreadCount: { gt: 0 },
        },
      }),
    ]);
    return { inbox, drafts, snoozed, spam };
  }

  private toListItem(t: ThreadWithLabels): ThreadListItemDto {
    return {
      id: t.id,
      accountId: t.accountId,
      accountColor: t.account.color,
      subject: t.subject,
      snippet: t.snippet,
      folder: t.folder,
      participants: t.participants as Address[],
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      isStarred: t.isStarred,
      isPinned: t.isPinned,
      isPriority: t.isPriority,
      hasAttachments: t.hasAttachments,
      snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
      lastMessageAt: t.lastMessageAt.toISOString(),
      labels: t.labels.map(
        (tl): LabelDto => ({
          id: tl.label.id,
          name: tl.label.name,
          color: tl.label.color,
        }),
      ),
    };
  }
}
