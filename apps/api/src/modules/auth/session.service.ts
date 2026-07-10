import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from "@novamail/shared";
import { ENV, type Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";

const TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

interface SessionRecord {
  sessionId: string;
  userId: string;
}

/**
 * Opaque-token sessions: the browser holds a random value in an httpOnly
 * cookie; we store only its SHA-256 hash. Postgres is the durable record,
 * Redis the read path (with sliding TTL). Sessions are individually revocable.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TTL_SECONDS * 1000,
    };
  }

  /** Creates a session and sets both the session and CSRF cookies. */
  async create(
    userId: string,
    userAgent: string | undefined,
    res: Response,
  ): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    const session = await this.prisma.session.create({
      data: { userId, tokenHash, userAgent: userAgent ?? null, expiresAt },
    });
    await this.redis.client.set(
      `sess:${tokenHash}`,
      JSON.stringify({ sessionId: session.id, userId } satisfies SessionRecord),
      "EX",
      TTL_SECONDS,
    );

    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
    // CSRF double-submit value: readable by JS, echoed back in a header.
    res.cookie(CSRF_COOKIE, randomBytes(16).toString("base64url"), {
      ...this.cookieOptions(),
      httpOnly: false,
    });
  }

  /** Resolves a cookie token to a live session, or null. */
  async resolve(token: string): Promise<SessionRecord | null> {
    const tokenHash = this.hash(token);
    const key = `sess:${tokenHash}`;

    const cached = await this.redis.client.get(key);
    if (cached !== null) {
      // Sliding expiry on the fast path.
      await this.redis.client.expire(key, TTL_SECONDS);
      return JSON.parse(cached) as SessionRecord;
    }

    // Redis miss (restart/eviction): fall back to Postgres and re-warm.
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });
    if (session === null || session.expiresAt < new Date()) {
      return null;
    }
    const record: SessionRecord = {
      sessionId: session.id,
      userId: session.userId,
    };
    await this.redis.client.set(key, JSON.stringify(record), "EX", TTL_SECONDS);
    return record;
  }

  async destroy(token: string, res: Response): Promise<void> {
    const tokenHash = this.hash(token);
    await this.redis.client.del(`sess:${tokenHash}`);
    await this.prisma.session.deleteMany({ where: { tokenHash } });
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(CSRF_COOKIE, { path: "/" });
  }
}
