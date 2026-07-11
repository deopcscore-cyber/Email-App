import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import type { LoginDto, RegisterDto, SessionUserDto } from "@novamail/shared";
import { QueueService } from "../../jobs/queue.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import type { OAuthIdentity } from "./oauth/oauth.types";
import { TokenVaultService } from "./token-vault.service";

const ACCOUNT_COLORS = ["#6E56CF", "#3B82F6", "#10B981", "#F59E0B", "#EC4899"];
const BCRYPT_ROUNDS = 12;

/**
 * Owns account identity: username/password registration and login, OAuth
 * mailbox linking (Google/Microsoft are connect-only now, never a sign-in
 * path), and the session bootstrap payload.
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
   * Creates a NovaMail account, or -- if a row with this email already
   * exists from before username/password login existed (an OAuth-created
   * account) and hasn't been claimed yet -- upgrades it in place. This
   * keeps any mailboxes/threads already connected to that email intact
   * rather than orphaning them under a fresh duplicate row.
   */
  async register(dto: RegisterDto): Promise<string> {
    const existingByUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });
    if (existingByUsername !== null) {
      throw new ConflictException("That username is taken");
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true },
    });
    if (existingByEmail !== null && existingByEmail.passwordHash !== null) {
      throw new ConflictException("That email is already registered");
    }

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    if (existingByEmail !== null) {
      const upgraded = await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: { username: dto.username, passwordHash, name: dto.name },
      });
      this.logger.log(`Claimed existing account for ${dto.email}`);
      return upgraded.id;
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        name: dto.name,
        settings: { create: {} },
      },
    });
    return user.id;
  }

  async login(dto: LoginDto): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true, passwordHash: true },
    });
    // Same generic failure whether the username doesn't exist or the
    // password is wrong -- don't let this endpoint confirm which.
    if (user === null || user.passwordHash === null) {
      throw new UnauthorizedException("Invalid username or password");
    }
    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid username or password");
    }
    return user.id;
  }

  /** Attaches a connected mailbox to the given (already signed-in) user. */
  async handleIdentity(
    identity: OAuthIdentity,
    linkToUserId: string,
  ): Promise<string> {
    const userId = linkToUserId;

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
        notificationSound: user.settings.notificationSound,
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
