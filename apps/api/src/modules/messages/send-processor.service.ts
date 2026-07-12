import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Address } from "@novamail/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { EventsService } from "../events/events.service";
import { SyncService, isSeedAccount } from "../sync/sync.service";
import { TokenBrokerService } from "../sync/token-broker.service";
import { UPLOAD_DIR } from "./messages.service";

/**
 * Executes queued sends when the undo window / schedule elapses. Runs in the
 * worker process. Seed accounts (dev, no real provider) simulate a
 * successful send so the whole pipeline is exercisable locally.
 */
@Injectable()
export class SendProcessorService {
  private readonly logger = new Logger(SendProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly sync: SyncService,
    private readonly broker: TokenBrokerService,
  ) {}

  async dispatch(messageId: string, userId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { attachments: true, account: true, thread: true },
    });
    // Undone or deleted while queued — nothing to do. FAILED is allowed so
    // BullMQ retries re-enter after a transient provider error.
    if (
      message === null ||
      (message.sendStatus !== "QUEUED" && message.sendStatus !== "FAILED")
    ) {
      return;
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { sendStatus: "SENDING" },
    });
    await this.events.publish(userId, {
      type: "sendStatus.changed",
      messageId,
      status: "SENDING",
    });

    try {
      if (!isSeedAccount(message.account)) {
        const provider = this.sync.providerFor(message.account);
        const accessToken = await this.broker.accessTokenFor(message.accountId);
        const attachments = await Promise.all(
          message.attachments
            .filter((a) => a.storageKey !== null)
            .map(async (a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              content: await readFile(join(UPLOAD_DIR, a.storageKey as string)),
            })),
        );
        // Without In-Reply-To/References, the recipient's client has no way
        // to match this against the original and threads it as a new email.
        let inReplyTo: string | undefined;
        if (message.replyToMessageId !== null) {
          const parent = await this.prisma.message.findUnique({
            where: { id: message.replyToMessageId },
            select: { internetMessageId: true },
          });
          inReplyTo = parent?.internetMessageId ?? undefined;
        }
        const result = await provider.send(accessToken, {
          to: message.toAddresses as Address[],
          cc: message.ccAddresses as Address[],
          bcc: message.bccAddresses as Address[],
          subject: message.subject,
          bodyHtml: message.bodyHtml ?? "",
          attachments,
          inReplyTo,
          providerThreadId: message.thread.providerThreadId.startsWith("local-")
            ? undefined
            : message.thread.providerThreadId,
        });
        await this.prisma.message.update({
          where: { id: messageId },
          data: { providerMessageId: result.providerMessageId },
        });
        if (message.thread.providerThreadId.startsWith("local-")) {
          await this.prisma.thread.update({
            where: { id: message.threadId },
            data: { providerThreadId: result.providerThreadId },
          });
        }
      }

      const now = new Date();
      await this.prisma.message.update({
        where: { id: messageId },
        data: { sendStatus: "SENT", sentAt: now, receivedAt: now },
      });
      // Standalone compose threads move to Sent; replies stay on their thread.
      if (message.thread.folder === "DRAFTS") {
        await this.prisma.thread.update({
          where: { id: message.threadId },
          data: { folder: "SENT", lastMessageAt: now, snippet: this.snippet(message.bodyHtml) },
        });
      } else {
        await this.prisma.thread.update({
          where: { id: message.threadId },
          data: {
            lastMessageAt: now,
            snippet: this.snippet(message.bodyHtml),
            messageCount: { increment: 0 }, // recount below
          },
        });
        const count = await this.prisma.message.count({
          where: { threadId: message.threadId, sendStatus: { notIn: ["DRAFT", "QUEUED", "FAILED"] } },
        });
        await this.prisma.thread.update({
          where: { id: message.threadId },
          data: { messageCount: count },
        });
      }

      await this.events.publish(userId, {
        type: "sendStatus.changed",
        messageId,
        status: "SENT",
      });
      await this.events.publish(userId, {
        type: "mail.updated",
        threadIds: [message.threadId],
      });
      this.logger.log(`Dispatched message ${messageId}`);
    } catch (err) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { sendStatus: "FAILED" },
      });
      await this.events.publish(userId, {
        type: "sendStatus.changed",
        messageId,
        status: "FAILED",
      });
      throw err; // let BullMQ retry with backoff
    }
  }

  private snippet(bodyHtml: string | null): string {
    return (bodyHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  }
}
