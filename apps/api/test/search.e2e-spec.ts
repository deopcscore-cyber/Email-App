import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase, seedSignedInUser } from "./test-app";

async function seedMessage(
  app: INestApplication,
  accountId: string,
  opts: {
    subject: string;
    bodyText: string;
    fromEmail: string;
    fromName?: string;
    hasAttachment?: boolean;
    receivedAt?: Date;
  },
) {
  const prisma = app.get(PrismaService);
  const thread = await prisma.thread.create({
    data: {
      accountId,
      providerThreadId: `t-${Math.random().toString(36).slice(2)}`,
      subject: opts.subject,
      snippet: opts.bodyText.slice(0, 80),
      folder: "INBOX",
      participants: [{ name: opts.fromName ?? null, email: opts.fromEmail }],
      hasAttachments: opts.hasAttachment ?? false,
      lastMessageAt: opts.receivedAt ?? new Date(),
    },
  });
  await prisma.message.create({
    data: {
      threadId: thread.id,
      accountId,
      providerMessageId: `m-${Math.random().toString(36).slice(2)}`,
      fromAddress: { name: opts.fromName ?? null, email: opts.fromEmail },
      toAddresses: [{ name: "Dami", email: "dami@novamail.dev" }],
      subject: opts.subject,
      snippet: opts.bodyText.slice(0, 80),
      bodyText: opts.bodyText,
      isRead: true,
      receivedAt: opts.receivedAt ?? new Date(),
      attachments:
        opts.hasAttachment === true
          ? { create: [{ filename: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 1024 }] }
          : undefined,
    },
  });
  return thread;
}

describe("Search (e2e)", () => {
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

  it("finds a thread by full-text keyword match on subject/body", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    await seedMessage(app, accountId, {
      subject: "Q2 Campaign Strategy",
      bodyText: "Focus on brand awareness and user acquisition.",
      fromEmail: "sarah@acme.com",
    });
    await seedMessage(app, accountId, {
      subject: "Lunch tomorrow?",
      bodyText: "Want to grab lunch?",
      fromEmail: "alex@brightlabs.io",
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search?q=campaign")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].subject).toBe("Q2 Campaign Strategy");
  });

  it("combines a keyword with a from: operator", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    await seedMessage(app, accountId, {
      subject: "Invoice #2081",
      bodyText: "Your invoice is due on the 18th.",
      fromEmail: "receipts@stripe.com",
      fromName: "Stripe",
    });
    await seedMessage(app, accountId, {
      subject: "Invoice from a different sender",
      bodyText: "Invoice attached.",
      fromEmail: "billing@other.com",
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search?q=" + encodeURIComponent("invoice from:stripe"))
      .set("Cookie", cookieHeader);

    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].subject).toBe("Invoice #2081");
    expect(res.body.parsed.operators).toContainEqual({ key: "from", value: "stripe" });
  });

  it("filters by has:attachment", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    await seedMessage(app, accountId, {
      subject: "With attachment",
      bodyText: "See attached invoice.",
      fromEmail: "a@acme.com",
      hasAttachment: true,
    });
    await seedMessage(app, accountId, {
      subject: "No attachment here",
      bodyText: "Just text.",
      fromEmail: "b@acme.com",
      hasAttachment: false,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search?q=" + encodeURIComponent("has:attachment"))
      .set("Cookie", cookieHeader);

    expect(res.body.threads).toHaveLength(1);
    expect(res.body.threads[0].subject).toBe("With attachment");
  });

  it("scopes results to the caller's own account", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const other = await seedSignedInUser(app, { email: "someone-else@novamail.dev" });
    await seedMessage(app, other.accountId, {
      subject: "Secret project",
      bodyText: "Confidential roadmap details.",
      fromEmail: "ceo@other.com",
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/search?q=secret")
      .set("Cookie", cookieHeader);
    expect(res.body.threads).toHaveLength(0);
  });

  it("returns empty results for a blank query", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const res = await request(app.getHttpServer())
      .get("/api/v1/search?q=")
      .set("Cookie", cookieHeader);
    expect(res.body.threads).toEqual([]);
  });
});
