import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EventsService } from "../events/events.service";

/** Returns snoozed threads to the top of the inbox when their timer fires. */
@Injectable()
export class SnoozeProcessorService {
  private readonly logger = new Logger(SnoozeProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async wake(threadId: string, userId: string): Promise<void> {
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, subject: true, snoozedUntil: true },
    });
    // Unsnoozed or deleted in the meantime.
    if (thread === null || thread.snoozedUntil === null) return;

    await this.prisma.thread.update({
      where: { id: threadId },
      data: {
        snoozedUntil: null,
        folder: "INBOX",
        // Bumping lastMessageAt floats the thread back to the top.
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });
    await this.events.publish(userId, {
      type: "snooze.fired",
      threadId,
      subject: thread.subject,
    });
    await this.events.publish(userId, {
      type: "mail.updated",
      threadIds: [threadId],
    });
    this.logger.log(`Woke snoozed thread ${threadId}`);
  }
}
