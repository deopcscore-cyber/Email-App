import { Body, Controller, Delete, Get, Inject, Post, UseGuards } from "@nestjs/common";
import type { PushSubscribeDto, PushUnsubscribeDto } from "@novamail/shared";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ENV, type Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";

@Controller("push")
@UseGuards(SessionGuard)
export class PushController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  /** Empty string means push notifications aren't configured server-side —
   * the frontend uses this to hide the "enable" toggle entirely. */
  @Get("public-key")
  publicKey(): { publicKey: string } {
    return { publicKey: this.env.VAPID_PUBLIC_KEY };
  }

  @Post("subscribe")
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeDto,
  ): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    return { ok: true };
  }

  @Delete("subscribe")
  async unsubscribe(
    @Body(new ZodValidationPipe(pushUnsubscribeSchema))
    body: PushUnsubscribeDto,
  ): Promise<{ ok: true }> {
    await this.prisma.pushSubscription
      .delete({ where: { endpoint: body.endpoint } })
      .catch(() => undefined);
    return { ok: true };
  }
}
