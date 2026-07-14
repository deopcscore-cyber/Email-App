import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { CSRF_TEST_HEADERS, createTestApp, resetDatabase, seedSignedInUser } from "./test-app";

async function seedThread(
  app: INestApplication,
  accountId: string,
  overrides: {
    subject?: string;
    folder?: "INBOX" | "SENT" | "DRAFTS" | "SPAM" | "TRASH" | "ARCHIVE";
    unreadCount?: number;
    isStarred?: boolean;
    lastMessageAt?: Date;
  } = {},
) {
  const prisma = app.get(PrismaService);
  const thread = await prisma.thread.create({
    data: {
      accountId,
      providerThreadId: `t-${Math.random().toString(36).slice(2)}`,
      subject: overrides.subject ?? "Q2 Campaign Strategy",
      snippet: "Hi Dami, here's the plan",
      folder: overrides.folder ?? "INBOX",
      participants: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
      unreadCount: overrides.unreadCount ?? 1,
      isStarred: overrides.isStarred ?? false,
      lastMessageAt: overrides.lastMessageAt ?? new Date(),
    },
  });
  await prisma.message.create({
    data: {
      threadId: thread.id,
      accountId,
      providerMessageId: `m-${Math.random().toString(36).slice(2)}`,
      fromAddress: { name: "Sarah Chen", email: "sarah@acme.com" },
      toAddresses: [{ name: "Dami", email: "dami@novamail.dev" }],
      subject: thread.subject,
      snippet: thread.snippet,
      bodyText: "Hi Dami, here's the plan for Q2.",
      isRead: (overrides.unreadCount ?? 1) === 0,
      receivedAt: thread.lastMessageAt,
    },
  });
  return thread;
}

describe("Threads (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
  });

  it("lists inbox threads newest-first, scoped to the caller", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const other = await seedSignedInUser(app, { email: "someone-else@novamail.dev" });

    await seedThread(app, accountId, {
      subject: "Older",
      lastMessageAt: new Date(Date.now() - 60_000),
    });
    await seedThread(app, accountId, { subject: "Newer" });
    await seedThread(app, other.accountId, { subject: "Not mine" });

    const res = await request(app.getHttpServer())
      .get("/api/v1/threads?view=inbox")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { subject: string }) => t.subject)).toEqual([
      "Newer",
      "Older",
    ]);
  });

  it("lists archived threads under the archive view", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    await seedThread(app, accountId, { subject: "In Inbox", folder: "INBOX" });
    await seedThread(app, accountId, { subject: "Archived", folder: "ARCHIVE" });

    const res = await request(app.getHttpServer())
      .get("/api/v1/threads?view=archive")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { subject: string }) => t.subject)).toEqual([
      "Archived",
    ]);
  });

  it("404s a thread not owned by the caller", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const other = await seedSignedInUser(app, { email: "owner2@novamail.dev" });
    const thread = await seedThread(app, other.accountId);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/threads/${thread.id}`)
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(404);
  });

  it("applies a triage patch (star) and it's reflected in list + detail", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const thread = await seedThread(app, accountId, { isStarred: false });

    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/threads/${thread.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ isStarred: true });
    expect(patch.status).toBe(200);
    expect(patch.body.isStarred).toBe(true);

    const starred = await request(app.getHttpServer())
      .get("/api/v1/threads?view=starred")
      .set("Cookie", cookieHeader);
    expect(starred.body.items).toHaveLength(1);
  });

  it("marking a thread read clears its unread count and updates counts", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const thread = await seedThread(app, accountId, { unreadCount: 1 });

    const before = await request(app.getHttpServer())
      .get("/api/v1/threads/counts")
      .set("Cookie", cookieHeader);
    expect(before.body.inbox).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/threads/${thread.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ isRead: true });

    const after = await request(app.getHttpServer())
      .get("/api/v1/threads/counts")
      .set("Cookie", cookieHeader);
    expect(after.body.inbox).toBe(0);
  });

  it("snoozing moves a thread out of the inbox view and into snoozed", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const thread = await seedThread(app, accountId);

    await request(app.getHttpServer())
      .patch(`/api/v1/threads/${thread.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() });

    const inbox = await request(app.getHttpServer())
      .get("/api/v1/threads?view=inbox")
      .set("Cookie", cookieHeader);
    expect(inbox.body.items).toHaveLength(0);

    const snoozed = await request(app.getHttpServer())
      .get("/api/v1/threads?view=snoozed")
      .set("Cookie", cookieHeader);
    expect(snoozed.body.items).toHaveLength(1);
  });

  it("rejects an invalid folder value on patch", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const thread = await seedThread(app, accountId);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/threads/${thread.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ folder: "NOT_A_FOLDER" });
    expect(res.status).toBe(400);
  });
});
