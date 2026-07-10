import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Address,
  CreateDraftDto,
  DraftDto,
  SendResultDto,
  UpdateDraftDto,
} from "@novamail/shared";
import { QueueService } from "../../jobs/queue.service";
import { PrismaService } from "../../prisma/prisma.service";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), "var", "uploads");
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

type DraftWithAttachments = Prisma.MessageGetPayload<{
  include: { attachments: true };
}>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  private toDraftDto(m: DraftWithAttachments): DraftDto {
    return {
      id: m.id,
      threadId: m.threadId,
      accountId: m.accountId,
      mode: m.replyToMessageId === null
        ? "new"
        : m.isDraftReplyAll
          ? "replyAll"
          : "reply",
      to: m.toAddresses as Address[],
      cc: m.ccAddresses as Address[],
      bcc: m.bccAddresses as Address[],
      subject: m.subject,
      bodyHtml: m.bodyHtml ?? "",
      attachments: m.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      })),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  async createDraft(userId: string, dto: CreateDraftDto): Promise<DraftDto> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id: dto.accountId, userId },
    });
    if (account === null) {
      throw new NotFoundException("Account not found");
    }

    // Replies live on the original thread; new mail and forwards start one.
    let threadId: string;
    let replyToMessageId: string | null = null;
    if (dto.mode === "reply" || dto.mode === "replyAll") {
      if (dto.replyToMessageId === undefined) {
        throw new BadRequestException("replyToMessageId required for replies");
      }
      const parent = await this.prisma.message.findFirst({
        where: { id: dto.replyToMessageId, account: { userId } },
        select: { id: true, threadId: true },
      });
      if (parent === null) {
        throw new NotFoundException("Message being replied to not found");
      }
      threadId = parent.threadId;
      replyToMessageId = parent.id;
    } else {
      const thread = await this.prisma.thread.create({
        data: {
          accountId: account.id,
          providerThreadId: `local-${randomUUID()}`,
          subject: dto.subject,
          folder: "DRAFTS",
          participants: [
            { name: account.displayName, email: account.email },
          ] as Prisma.InputJsonValue[],
          lastMessageAt: new Date(),
        },
      });
      threadId = thread.id;
    }

    const draft = await this.prisma.message.create({
      data: {
        threadId,
        accountId: account.id,
        fromAddress: {
          name: account.displayName,
          email: account.email,
        } as Prisma.InputJsonValue,
        toAddresses: dto.to as Prisma.InputJsonValue[],
        ccAddresses: dto.cc as Prisma.InputJsonValue[],
        bccAddresses: dto.bcc as Prisma.InputJsonValue[],
        replyToMessageId,
        isDraftReplyAll: dto.mode === "replyAll",
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        isRead: true,
        sendStatus: "DRAFT",
      },
      include: { attachments: true },
    });
    return this.toDraftDto(draft);
  }

  async updateDraft(
    userId: string,
    draftId: string,
    dto: UpdateDraftDto,
  ): Promise<DraftDto> {
    const draft = await this.ownedDraft(userId, draftId);
    const updated = await this.prisma.message.update({
      where: { id: draft.id },
      data: {
        ...(dto.to !== undefined && {
          toAddresses: dto.to as Prisma.InputJsonValue[],
        }),
        ...(dto.cc !== undefined && {
          ccAddresses: dto.cc as Prisma.InputJsonValue[],
        }),
        ...(dto.bcc !== undefined && {
          bccAddresses: dto.bcc as Prisma.InputJsonValue[],
        }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.bodyHtml !== undefined && {
          bodyHtml: dto.bodyHtml,
          snippet: dto.bodyHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 120),
        }),
      },
      include: { attachments: true },
    });
    return this.toDraftDto(updated);
  }

  async deleteDraft(userId: string, draftId: string): Promise<void> {
    const draft = await this.ownedDraft(userId, draftId);
    await this.prisma.message.delete({ where: { id: draft.id } });
    // Standalone compose threads disappear with their only draft.
    const remaining = await this.prisma.message.count({
      where: { threadId: draft.threadId },
    });
    if (remaining === 0) {
      await this.prisma.thread.delete({ where: { id: draft.threadId } });
    }
  }

  async getDraft(userId: string, draftId: string): Promise<DraftDto> {
    const draft = await this.ownedDraft(userId, draftId);
    return this.toDraftDto(draft);
  }

  /** Queues the send after the undo window (or at scheduledAt). */
  async send(
    userId: string,
    draftId: string,
    scheduledAt?: string,
  ): Promise<SendResultDto> {
    const draft = await this.ownedDraft(userId, draftId);
    const to = draft.toAddresses as Address[];
    if (to.length === 0) {
      throw new BadRequestException("Add at least one recipient");
    }

    const settings = await this.prisma.userSettings.findUniqueOrThrow({
      where: { userId },
      select: { undoWindowSeconds: true },
    });
    const dispatchAt =
      scheduledAt !== undefined
        ? new Date(scheduledAt)
        : new Date(Date.now() + settings.undoWindowSeconds * 1000);
    if (dispatchAt.getTime() < Date.now() - 1000) {
      throw new BadRequestException("scheduledAt is in the past");
    }

    await this.prisma.message.update({
      where: { id: draft.id },
      data: {
        sendStatus: "QUEUED",
        scheduledAt: scheduledAt !== undefined ? dispatchAt : null,
        receivedAt: new Date(),
      },
    });
    await this.queues.enqueue(
      "send",
      { kind: "dispatch", messageId: draft.id, userId },
      { delayMs: Math.max(dispatchAt.getTime() - Date.now(), 0), jobId: `send-${draft.id}` },
    );
    return { messageId: draft.id, dispatchAt: dispatchAt.toISOString() };
  }

  /** Cancels a queued send inside the undo window / before schedule. */
  async undo(userId: string, messageId: string): Promise<DraftDto> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, account: { userId } },
      include: { attachments: true },
    });
    if (message === null) throw new NotFoundException("Message not found");
    if (message.sendStatus !== "QUEUED") {
      throw new ConflictException("Message has already been sent");
    }

    const cancelled = await this.queues.cancel("send", `send-${messageId}`);
    if (!cancelled) {
      throw new ConflictException("Too late — the message is being sent");
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { sendStatus: "DRAFT", scheduledAt: null },
      include: { attachments: true },
    });
    return this.toDraftDto(updated);
  }

  async addAttachment(
    userId: string,
    draftId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ): Promise<DraftDto["attachments"][number]> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException("Attachment exceeds 25 MB");
    }
    const draft = await this.ownedDraft(userId, draftId);

    await mkdir(UPLOAD_DIR, { recursive: true });
    const storageKey = `${randomUUID()}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
    await writeFile(join(UPLOAD_DIR, storageKey), file.buffer);

    const attachment = await this.prisma.attachment.create({
      data: {
        messageId: draft.id,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
      },
    });
    await this.prisma.thread.update({
      where: { id: draft.threadId },
      data: { hasAttachments: true },
    });
    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async removeAttachment(
    userId: string,
    draftId: string,
    attachmentId: string,
  ): Promise<void> {
    const draft = await this.ownedDraft(userId, draftId);
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, messageId: draft.id },
    });
    if (attachment === null) throw new NotFoundException("Attachment not found");
    if (attachment.storageKey !== null) {
      await unlink(join(UPLOAD_DIR, attachment.storageKey)).catch(() => undefined);
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
  }

  private async ownedDraft(
    userId: string,
    draftId: string,
  ): Promise<DraftWithAttachments> {
    const draft = await this.prisma.message.findFirst({
      where: {
        id: draftId,
        account: { userId },
        sendStatus: { in: ["DRAFT", "QUEUED"] },
      },
      include: { attachments: true },
    });
    if (draft === null) {
      throw new NotFoundException("Draft not found");
    }
    return draft;
  }
}

export { UPLOAD_DIR };
