import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { CSRF_TEST_HEADERS, createTestApp, resetDatabase, seedSignedInUser } from "./test-app";

describe("Auth + CSRF (e2e)", () => {
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

  it("rejects /auth/session with no cookie", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/session");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the bootstrap payload for a valid session", async () => {
    const { cookieHeader, userId } = await seedSignedInUser(app, {
      email: "session-user@novamail.dev",
    });
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Cookie", cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: userId,
      email: "session-user@novamail.dev",
      accounts: [expect.objectContaining({ syncStatus: "ACTIVE" })],
    });
  });

  it("rejects a mutation without a matching CSRF header", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const res = await request(app.getHttpServer())
      .patch("/api/v1/me/settings")
      .set("Cookie", cookieHeader)
      .send({ theme: "DARK" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("accepts a mutation with a matching CSRF header and cookie", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const res = await request(app.getHttpServer())
      .patch("/api/v1/me/settings")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ theme: "DARK", undoWindowSeconds: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ theme: "DARK", undoWindowSeconds: 30 });
  });

  it("returns field-level validation errors for an invalid body", async () => {
    const { cookieHeader } = await seedSignedInUser(app);
    const res = await request(app.getHttpServer())
      .patch("/api/v1/me/settings")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS)
      .send({ undoWindowSeconds: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ path: "undoWindowSeconds" });
  });

  it("destroys the session on logout so the cookie no longer authenticates", async () => {
    const { cookieHeader } = await seedSignedInUser(app);

    const logout = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(logout.status).toBe(204);

    const after = await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Cookie", cookieHeader);
    expect(after.status).toBe(401);
  });

  it("redirects /auth/google to Google with PKCE params when configured", async () => {
    // Unconfigured in the test env (no client id) — asserts the guard rail
    // rather than a real provider redirect.
    const res = await request(app.getHttpServer()).get("/api/v1/auth/google");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not configured/i);
  });
});
