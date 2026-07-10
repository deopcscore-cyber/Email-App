import { ConflictException, Injectable, Logger } from "@nestjs/common";
import type { SessionUserDto } from "@novamail/shared";
import { QueueService } from "../../jobs/queue.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import type { OAuthIdentity } from "./oauth/oauth.types";
import { TokenVaultService } from "./token-vault.service";

const ACCOUNT_COLORS = ["#6E56CF", "#3B82F6", "#10B981", "#F59E0B", "#EC4899"];

/**
 * Owns the identity side of OAuth completion: user creation, mailbox
 * linking, and the session bootstrap payload.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly vault: TokenVaultService,
    private readonly queues: QueueService,
  ) {}

  /**
   * Completes sign-in or account-link. Returns the user id to bind the
   * session to (for links, the existing user).
   */
  async handleIdentity(
    identity: OAuthIdentity,
    linkToUserId?: string,
  ): Promise<string> {
    const userId =
      linkToUserId ?? (await this.findOrCreateUser(identity)).id;

    const existing = await this.prisma.emailAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      select: { id: true, userId: true },
    });
    if (existing !== null && existing.userId !== userId) {
      throw new ConflictException(
        "This mailbox is already connected to a different NovaMail user",
      );
    }

    const encryptedRefreshToken = this.vault.encrypt(identity.refreshToken);
    const account = await this.prisma.emailAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      },
      create: {
        userId,
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        displayName: identity.name,
        encryptedRefreshToken,
        scopes: identity.scopes,
        color: await this.nextAccountColor(userId),
      },
      update: {
        encryptedRefreshToken,
        scopes: identity.scopes,
        syncStatus: "PENDING", // reconnects reset a possibly-errored account
      },
    });

    // Cache the short-lived access token so the sync worker (Phase 4) can
    // start immediately without a refresh round-trip.
    await this.redis.client.set(
      `oauth:access:${account.id}`,
      identity.accessToken,
      "EX",
      Math.max(identity.accessTokenExpiresIn - 60, 60),
    );

    await this.queues.enqueue("sync", {
      kind: "backfill",
      accountId: account.id,
    });
    this.logger.log(
      `Connected ${identity.provider} mailbox ${identity.email} for user ${userId}`,
    );
    return userId;
  }

  private async findOrCreateUser(identity: OAuthIdentity) {
    const existing = await this.prisma.user.findUnique({
      where: { email: identity.email },
    });
    if (existing !== null) {
      return existing;
    }
    return this.prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        settings: { create: {} },
      },
    });
  }

  private async nextAccountColor(userId: string): Promise<string> {
    const count = await this.prisma.emailAccount.count({ where: { userId } });
    return ACCOUNT_COLORS[count % ACCOUNT_COLORS.length] as string;
  }

  /** Bootstrap payload for GET /auth/session. */
  async sessionUser(userId: string): Promise<SessionUserDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        accounts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            provider: true,
            email: true,
            displayName: true,
            syncStatus: true,
            color: true,
            createdAt: true,
          },
        },
      },
    });
    if (user === null || user.settings === null) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      settings: {
        theme: user.settings.theme,
        undoWindowSeconds: user.settings.undoWindowSeconds as 0 | 5 | 10 | 30,
        aiEnabled: user.settings.aiEnabled,
        aiAutoLabels: user.settings.aiAutoLabels,
        aiDailyBriefing: user.settings.aiDailyBriefing,
        aiFollowUps: user.settings.aiFollowUps,
        briefingHourLocal: user.settings.briefingHourLocal,
        timezone: user.settings.timezone,
      },
      accounts: user.accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        email: a.email,
        displayName: a.displayName,
        syncStatus: a.syncStatus,
        color: a.color,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
