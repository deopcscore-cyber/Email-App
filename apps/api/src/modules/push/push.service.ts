import { Inject, Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import { ENV, type Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";

interface PushPayload {
  title: string;
  body: string;
  /** Relative URL to open/focus when the notification is clicked. */
  url: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = env.VAPID_PUBLIC_KEY !== "" && env.VAPID_PRIVATE_KEY !== "";
    if (this.enabled) {
      webpush.setVapidDetails(
        env.VAPID_SUBJECT,
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
      );
    }
  }

  /** Fans a payload out to every browser the user has subscribed from;
   * prunes subscriptions the push service reports as gone. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) return;

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode =
            err !== null && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode: number }).statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
          } else {
            this.logger.warn(`Push send failed for ${sub.id}: ${String(err)}`);
          }
        }
      }),
    );
  }
}
