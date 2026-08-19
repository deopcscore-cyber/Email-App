import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { SendProcessorService } from "../src/modules/messages/send-processor.service";
import { CSRF_TEST_HEADERS, createTestApp, resetDatabase, seedSignedInUser } from "./test-app";

describe("Messages: drafts, send, undo (e2e)", () => {
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

  it("creates a new-mail draft and lets it be updated", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);

    const create = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({
        accountId,
        mode: "new",
        to: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
        subject: "Q3 kickoff",
        bodyHtml: "<p>Draft one.</p>",
      });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ mode: "new", subject: "Q3 kickoff" });

    const update = await request(app.getHttpServer())
      .patch(`/api/v1/messages/drafts/${create.body.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ bodyHtml: "<p>Edited draft.</p>" });
    expect(update.status).toBe(200);
    expect(update.body.bodyHtml).toBe("<p>Edited draft.</p>");
  });

  it("rejects sending a draft with no recipients", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const draft = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ accountId, mode: "new", to: [], subject: "No one", bodyHtml: "<p>hi</p>" });

    const send = await request(app.getHttpServer())
      .post(`/api/v1/messages/${draft.body.id}/send`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({});
    expect(send.status).toBe(400);
  });

  it("queues a send, allows undo within the window, and rejects undo once dispatched", async () => {
    const { cookieHeader, accountId, userId } = await seedSignedInUser(app);
    const draft = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({
        accountId,
        mode: "new",
        to: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
        subject: "Ship it",
        bodyHtml: "<p>Body.</p>",
      });
    const draftId = draft.body.id as string;

    const send = await request(app.getHttpServer())
      .post(`/api/v1/messages/${draftId}/send`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({});
    expect(send.status).toBe(201);
    expect(send.body.messageId).toBe(draftId);

    const prisma = app.get(PrismaService);
    const queued = await prisma.message.findUniqueOrThrow({ where: { id: draftId } });
    expect(queued.sendStatus).toBe("QUEUED");

    const undo = await request(app.getHttpServer())
      .post(`/api/v1/messages/${draftId}/undo`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(undo.status).toBe(201);
    expect(undo.body.mode).toBe("new");

    const restored = await prisma.message.findUniqueOrThrow({ where: { id: draftId } });
    expect(restored.sendStatus).toBe("DRAFT");

    // Dispatch (simulating the worker consuming the delayed job) …
    await app.get(SendProcessorService).dispatch(draftId, userId);
    // …then a second undo attempt must fail: it's no longer QUEUED.
    const tooLate = await request(app.getHttpServer())
      .post(`/api/v1/messages/${draftId}/undo`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(tooLate.status).toBe(409);
  });

  it("dispatch marks a seed-account message SENT and moves the thread to Sent", async () => {
    const { cookieHeader, accountId, userId } = await seedSignedInUser(app);
    const draft = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({
        accountId,
        mode: "new",
        to: [{ name: "Sarah Chen", email: "sarah@acme.com" }],
        subject: "Announcement",
        bodyHtml: "<p>Hello everyone.</p>",
      });

    await request(app.getHttpServer())
      .post(`/api/v1/messages/${draft.body.id}/send`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({});

    await app.get(SendProcessorService).dispatch(draft.body.id, userId);

    const prisma = app.get(PrismaService);
    const sent = await prisma.message.findUniqueOrThrow({ where: { id: draft.body.id } });
    expect(sent.sendStatus).toBe("SENT");
    expect(sent.sentAt).not.toBeNull();

    const thread = await prisma.thread.findUniqueOrThrow({ where: { id: sent.threadId } });
    expect(thread.folder).toBe("SENT");
  });

  it("uploads an attachment and downloads back the exact same bytes", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const draft = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ accountId, mode: "new", to: [], subject: "Has an attachment", bodyHtml: "" });

    const original = Buffer.from("not-quite-base64-friendly bytes \x00\xff\x10", "binary");
    const upload = await request(app.getHttpServer())
      .post(`/api/v1/messages/${draft.body.id}/attachments`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .attach("file", original, { filename: "notes.bin", contentType: "application/octet-stream" });
    expect(upload.status).toBe(201);
    expect(upload.body.filename).toBe("notes.bin");
    expect(upload.body.sizeBytes).toBe(original.length);

    const download = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${upload.body.id}/download`)
      .set("Cookie", cookieHeader)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, original)).toBe(0);
  });

  it("deleting a standalone draft removes its thread too", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);
    const draft = await request(app.getHttpServer())
      .post("/api/v1/messages/drafts")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ accountId, mode: "new", to: [], subject: "Scratch", bodyHtml: "" });

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/messages/drafts/${draft.body.id}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(del.status).toBe(204);

    const prisma = app.get(PrismaService);
    expect(await prisma.thread.findUnique({ where: { id: draft.body.threadId } })).toBeNull();
  });
});
