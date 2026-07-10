import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { CSRF_COOKIE, SESSION_COOKIE } from "@novamail/shared";
import type { AuthenticatedRequest } from "../../../common/decorators/current-user.decorator";
import { SessionService } from "../session.service";

/** Rejects requests without a valid session cookie; attaches `req.user`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies[SESSION_COOKIE];
    if (token === undefined) {
      throw new UnauthorizedException("Not signed in");
    }
    const record = await this.sessions.resolve(token);
    if (record === null) {
      throw new UnauthorizedException("Session expired");
    }
    req.user = { id: record.userId, sessionId: record.sessionId };

    // Self-heal the CSRF double-submit cookie (e.g. sessions restored from
    // storage, dev seed sessions) so mutations don't 403 mysteriously.
    if (cookies[CSRF_COOKIE] === undefined) {
      const res = context.switchToHttp().getResponse<Response>();
      res.cookie(CSRF_COOKIE, randomBytes(16).toString("base64url"), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }
    return true;
  }
}
