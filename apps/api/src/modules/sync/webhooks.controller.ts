import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueService } from "../../jobs/queue.service";

/**
 * Provider push notifications. Handlers only validate and enqueue — never
 * sync inline. Exempt from CSRF (no session cookie involved).
 */
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  /** Gmail watch → Cloud Pub/Sub push. Payload: base64 {emailAddress, historyId}. */
  @Post("gmail")
  @HttpCode(200)
  async gmail(
    @Body() body: { message?: { data?: string } },
  ): Promise<{ ok: boolean }> {
    const data = body.message?.data;
    if (data === undefined) return { ok: true };
    try {
      const payload = JSON.parse(
        Buffer.from(data, "base64").toString("utf8"),
      ) as { emailAddress?: string };
      if (payload.emailAddress !== undefined) {
        const account = await this.prisma.emailAccount.findFirst({
          where: { provider: "GOOGLE", email: payload.emailAddress.toLowerCase() },
          select: { id: true },
        });
        if (account !== null) {
          // jobId dedupes bursts of notifications for the same account.
          await this.queues.enqueue(
            "sync",
            { kind: "delta", accountId: account.id },
            { jobId: `delta-${account.id}-${Math.floor(Date.now() / 5_000)}` },
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Bad Gmail webhook payload: ${String(err)}`);
    }
    return { ok: true };
  }

  /** Microsoft Graph change notifications (+ subscription validation). */
  @Post("graph")
  async graph(
    @Query("validationToken") validationToken: string | undefined,
    @Body()
    body: {
      value?: { clientState?: string; subscriptionId?: string; resourceData?: { id?: string } }[];
    },
    @Res() res: Response,
  ): Promise<void> {
    // Subscription handshake echoes the token as text/plain.
    if (validationToken !== undefined) {
      res.status(200).type("text/plain").send(validationToken);
      return;
    }
    for (const notification of body.value ?? []) {
      const clientState = notification.clientState;
      if (clientState === undefined) continue;
      // clientState carries our accountId (set when creating the subscription).
      const account = await this.prisma.emailAccount.findUnique({
        where: { id: clientState },
        select: { id: true },
      });
      if (account !== null) {
        await this.queues.enqueue(
          "sync",
          { kind: "delta", accountId: account.id },
          { jobId: `delta-${account.id}-${Math.floor(Date.now() / 5_000)}` },
        );
      }
    }
    res.status(202).send();
  }
}
