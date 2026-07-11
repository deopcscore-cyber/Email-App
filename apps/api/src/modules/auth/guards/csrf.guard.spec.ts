import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { CSRF_COOKIE, CSRF_HEADER } from "@novamail/shared";
import { CsrfGuard } from "./csrf.guard";

function contextFor(
  method: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
  path = "/api/v1/threads/abc",
): ExecutionContext {
  const req = {
    method,
    path,
    cookies,
    header: (name: string) => headers[name.toLowerCase()],
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("CsrfGuard", () => {
  const guard = new CsrfGuard();

  it.each(["GET", "HEAD", "OPTIONS"])("allows safe method %s without a token", (method) => {
    expect(guard.canActivate(contextFor(method))).toBe(true);
  });

  it("rejects a mutating request with no CSRF cookie or header", () => {
    expect(() => guard.canActivate(contextFor("POST"))).toThrow(ForbiddenException);
  });

  it("rejects when the header doesn't match the cookie", () => {
    const ctx = contextFor(
      "PATCH",
      { [CSRF_COOKIE]: "abc123" },
      { [CSRF_HEADER]: "different" },
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("accepts a mutating request when header matches cookie", () => {
    const ctx = contextFor(
      "POST",
      { [CSRF_COOKIE]: "matching-token" },
      { [CSRF_HEADER]: "matching-token" },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("exempts provider webhook paths from CSRF (no cookie session involved)", () => {
    const ctx = contextFor("POST", {}, {}, "/api/v1/webhooks/gmail");
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
