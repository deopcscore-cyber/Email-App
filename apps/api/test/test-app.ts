import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { createHash, randomBytes } from "node:crypto";
import { API_PREFIX } from "@novamail/shared";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

/** Boots the real Nest app (no HTTP listener) for supertest integration specs. */
export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.DEBUG_TEST_LOGS === "1" ? undefined : false,
  });
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

/** Wipes every table between specs; faster than recreating the schema. */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$transaction([
    prisma.aiArtifact.deleteMany(),
    prisma.followUpReminder.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.message.deleteMany(),
    prisma.threadLabel.deleteMany(),
    prisma.thread.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.label.deleteMany(),
    prisma.emailAccount.deleteMany(),
    prisma.session.deleteMany(),
    prisma.userSettings.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  await app.get(RedisService).client.flushdb();
}

interface SeededUser {
  userId: string;
  accountId: string;
  cookieHeader: string;
}

/**
 * Creates a signed-in user with one "seed-style" email account (its
 * encryptedRefreshToken is prefixed "seed-" so SyncService treats it as a
 * fake account and skips real provider calls) and returns cookies ready to
 * attach to a supertest request.
 */
export async function seedSignedInUser(
  app: INestApplication,
  overrides: { email?: string } = {},
): Promise<SeededUser> {
  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);

  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `test-${randomBytes(4).toString("hex")}@novamail.dev`,
      name: "Test User",
      settings: { create: {} },
    },
  });
  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: "GOOGLE",
      providerAccountId: `seed-${user.id}`,
      email: user.email,
      displayName: user.name,
      encryptedRefreshToken: "seed-not-a-real-token",
      scopes: [],
      syncStatus: "ACTIVE",
    },
  });

  const sessionToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await redis.client.set(
    `sess:${tokenHash}`,
    JSON.stringify({ sessionId: "seed", userId: user.id }),
    "EX",
    3_600,
  );

  const csrfToken = "test-csrf-token";
  const cookieHeader = [
    `novamail_session=${sessionToken}`,
    `novamail_csrf=${csrfToken}`,
  ].join("; ");

  return { userId: user.id, accountId: account.id, cookieHeader };
}

export const CSRF_TEST_HEADERS = { "x-csrf-token": "test-csrf-token" };
