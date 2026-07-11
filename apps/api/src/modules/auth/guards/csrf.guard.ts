import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { CSRF_COOKIE, CSRF_HEADER } from "@novamail/shared";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF protection for cookie-authenticated mutations: the JS
 * client reads the CSRF cookie and echoes it in a header; a cross-site
 * attacker can trigger the cookie but cannot read it to forge the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }
    // Provider webhooks are authenticated by their own mechanisms, not cookies.
    if (req.path.startsWith("/api/v1/webhooks/")) {
      return true;
    }
    // No session (and thus no CSRF cookie) exists yet before these succeed.
    if (req.path === "/api/v1/auth/register" || req.path === "/api/v1/auth/login") {
      return true;
    }

    const cookie = (req.cookies as Record<string, string | undefined>)[
      CSRF_COOKIE
    ];
    const header = req.header(CSRF_HEADER);
    if (
      cookie === undefined ||
      header === undefined ||
      cookie.length !== header.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
    ) {
      throw new ForbiddenException("CSRF token missing or invalid");
    }
    return true;
  }
}
