import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/modules/auth/auth.service";
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

  it("rejects /auth/google when there is no signed-in session", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/google");
    expect(res.status).toBe(401);
  });

  it("redirects /auth/google to Google with PKCE params when configured", async () => {
    // Unconfigured in the test env (no client id) — asserts the guard rail
    // rather than a real provider redirect. Connecting requires a session.
    const { cookieHeader } = await seedSignedInUser(app);
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/google")
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not configured/i);
  });

  it("registers a new NovaMail account with username/password", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        username: "newuser1",
        email: "newuser1@novamail.dev",
        name: "New User",
        password: "correct-horse-battery",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "newuser1@novamail.dev", accounts: [] });
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects registration with a taken username", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      username: "dupeuser",
      email: "dupe1@novamail.dev",
      name: "Dupe One",
      password: "correct-horse-battery",
    });
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      username: "dupeuser",
      email: "dupe2@novamail.dev",
      name: "Dupe Two",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(409);
  });

  it("upgrades an existing OAuth-created row in place when registering with the same email", async () => {
    const { userId, accountId } = await seedSignedInUser(app, {
      email: "claimed@novamail.dev",
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        username: "claimeduser",
        email: "claimed@novamail.dev",
        name: "Claimed User",
        password: "correct-horse-battery",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(userId);
    expect(res.body.accounts).toEqual([expect.objectContaining({ id: accountId })]);
  });

  it("logs in with a valid username/password", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      username: "loginuser",
      email: "loginuser@novamail.dev",
      name: "Login User",
      password: "correct-horse-battery",
    });

    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "loginuser",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "loginuser@novamail.dev" });
  });

  it("rejects login with a wrong password", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      username: "wrongpassuser",
      email: "wrongpass@novamail.dev",
      name: "Wrong Pass",
      password: "correct-horse-battery",
    });

    const res = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "wrongpassuser",
      password: "not-the-password",
    });
    expect(res.status).toBe(401);
  });

  it("removes a connected account and drops it from the session bootstrap", async () => {
    const { cookieHeader, accountId } = await seedSignedInUser(app);

    const del = await request(app.getHttpServer())
      .delete(`/api/v1/me/accounts/${accountId}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(del.status).toBe(204);

    const session = await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Cookie", cookieHeader);
    expect(session.body.accounts).toEqual([]);
  });

  it("rejects removing another user's account", async () => {
    const { accountId } = await seedSignedInUser(app, { email: "victim@novamail.dev" });
    const { cookieHeader } = await seedSignedInUser(app, { email: "attacker@novamail.dev" });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/me/accounts/${accountId}`)
      .set("Cookie", cookieHeader)
      .set(CSRF_TEST_HEADERS);
    expect(res.status).toBe(404);
  });

  it("changes the password, then rejects the old one and accepts the new one", async () => {
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      username: "pwchangeuser",
      email: "pwchange@novamail.dev",
      name: "PW Change",
      password: "correct-horse-battery",
    });
    const login = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "pwchangeuser",
      password: "correct-horse-battery",
    });
    const setCookies = login.headers["set-cookie"] as unknown as string[];
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
    const csrfToken = setCookies
      .find((c) => c.startsWith("novamail_csrf="))
      ?.split(";")[0]
      .split("=")[1];

    const change = await request(app.getHttpServer())
      .put("/api/v1/auth/password")
      .set("Cookie", cookieHeader)
      .set("x-csrf-token", csrfToken as string)
      .send({ password: "new-correct-horse-battery" });
    expect(change.status).toBe(204);

    const oldLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "pwchangeuser",
      password: "correct-horse-battery",
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
      username: "pwchangeuser",
      password: "new-correct-horse-battery",
    });
    expect(newLogin.status).toBe(200);
  });

  it("rejects changing the password with no session", async () => {
    // No cookies at all -- the global CSRF guard rejects this before the
    // route's SessionGuard ever runs, which is still a correct block.
    const res = await request(app.getHttpServer())
      .put("/api/v1/auth/password")
      .set(CSRF_TEST_HEADERS)
      .send({ password: "whatever-new-password" });
    expect(res.status).toBe(403);
  });

  it("allows /auth/google?intent=recover without a session (still 400: unconfigured in tests)", async () => {
    // Same "not configured" guard rail as the connect flow's test above --
    // what this actually asserts is that recovery, unlike connecting a
    // mailbox, never demands a session first (no 401).
    const res = await request(app.getHttpServer()).get(
      "/api/v1/auth/google?intent=recover",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not configured/i);
  });

  it("finds the NovaMail user that owns a given provider identity, for recovery", async () => {
    const { userId, accountId } = await seedSignedInUser(app, {
      email: "recoverable@novamail.dev",
    });
    const prisma = app.get(PrismaService);
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { provider: true, providerAccountId: true },
    });

    const auth = app.get(AuthService);
    const found = await auth.findUserIdByProviderAccount(
      account.provider,
      account.providerAccountId,
    );
    expect(found).toBe(userId);

    const notFound = await auth.findUserIdByProviderAccount(
      account.provider,
      "some-other-provider-account-id",
    );
    expect(notFound).toBeNull();
  });
});
